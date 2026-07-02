// ============================================================================
// Worker building blocks: atomic claiming, execution, heartbeats and the
// pluggable handler registry. Kept separate from index.ts (the process
// entrypoint) so each piece is independently unit-testable.
// ============================================================================
import { PrismaClient, type Job } from "@prisma/client";
import winston from "winston";
import { computeRetryDelayMs } from "../../shared/index.js";

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.simple()),
  transports: [new winston.transports.Console()],
});

export const prisma = new PrismaClient();

// ------------------------------------------------------------- HANDLERS ----
export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

/** Default handlers by job "name" prefix — replace with real business logic per queue. */
export const handlerRegistry: Record<string, JobHandler> = {
  default: async (payload) => {
    const duration = Number(payload.durationMs ?? 1000);
    await new Promise((resolve) => setTimeout(resolve, duration));
    if (payload.forceFail) throw new Error("Simulated deterministic failure (forceFail=true)");
    if (Math.random() < 0.15) throw new Error("Simulated transient failure");
  },
};

export function resolveHandler(_jobName: string): JobHandler {
  return handlerRegistry.default;
}

// --------------------------------------------------------- ATOMIC CLAIM ----
/**
 * Claims at most one eligible job for this worker using a raw
 * `SELECT ... FOR UPDATE SKIP LOCKED` transaction — the cornerstone
 * guarantee that no two worker processes ever execute the same job.
 */
export async function claimNextJob(workerId: string, queueIds: string[]): Promise<Job | null> {
  if (queueIds.length === 0) return null;
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT j.id
      FROM jobs j
      JOIN queues q ON q.id = j.queue_id
      WHERE j.status = 'QUEUED'
        AND j.run_at <= now()
        AND q.is_paused = false
        AND q.id = ANY(${queueIds})
        AND (
          SELECT count(*) FROM jobs j2
          WHERE j2.queue_id = q.id AND j2.status IN ('CLAIMED', 'RUNNING')
        ) < q.concurrency_limit
      ORDER BY j.priority DESC, j.run_at ASC
      FOR UPDATE OF j SKIP LOCKED
      LIMIT 1;
    `;
    if (!rows[0]) return null;
    return tx.job.update({ where: { id: rows[0].id }, data: { status: "CLAIMED", claimedBy: workerId, claimedAt: new Date() } });
  });
}

// ------------------------------------------------------------- EXECUTOR ----
export async function executeJob(job: Job, workerId: string) {
  const attempt = job.attempts + 1;
  await prisma.job.update({ where: { id: job.id }, data: { status: "RUNNING", startedAt: new Date(), attempts: attempt } });
  const execution = await prisma.jobExecution.create({
    data: { jobId: job.id, workerId, attemptNumber: attempt, status: "RUNNING", startedAt: new Date() },
  });
  await log(job.id, execution.id, "info", `Worker ${workerId} started attempt ${attempt}/${job.maxAttempts}`);

  const startedAt = Date.now();
  try {
    await resolveHandler(job.name)(job.payload as Record<string, unknown>);
    const durationMs = Date.now() - startedAt;
    await prisma.$transaction([
      prisma.job.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date(), durationMs } }),
      prisma.jobExecution.update({ where: { id: execution.id }, data: { status: "COMPLETED", completedAt: new Date(), durationMs } }),
    ]);
    await log(job.id, execution.id, "info", `Completed successfully in ${durationMs}ms`);
    await settleBatch(job, false);
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack ?? "" : "";
    await prisma.jobExecution.update({ where: { id: execution.id }, data: { status: "FAILED", completedAt: new Date(), durationMs, errorMessage: message, errorStack: stack } });
    await log(job.id, execution.id, "error", `Attempt ${attempt} failed: ${message}`);
    await handleFailure(job, attempt, message);
  }
}

async function handleFailure(job: Job, attempt: number, message: string) {
  if (attempt < job.maxAttempts) {
    const queue = await prisma.queue.findUniqueOrThrow({ where: { id: job.queueId } });
    const policy = await prisma.retryPolicy.findUniqueOrThrow({ where: { id: queue.retryPolicyId } });
    const delay = computeRetryDelayMs(policy.strategy as any, attempt, policy.baseDelayMs, policy.maxDelayMs);
    await prisma.job.update({ where: { id: job.id }, data: { status: "RETRYING", runAt: new Date(Date.now() + delay), claimedBy: null, lastError: message } });
    logger.warn(`Job ${job.id} scheduled for retry ${attempt + 1}/${job.maxAttempts} in ${delay}ms`);
    // Promote RETRYING -> QUEUED once runAt elapses (handled by the scheduler sweep in server/src/scheduler.ts
    // or, for a standalone worker deployment, by this same worker's poll loop — see index.ts `promoteDueJobs`).
  } else {
    await prisma.$transaction([
      prisma.job.update({ where: { id: job.id }, data: { status: "DEAD_LETTER", lastError: message } }),
      prisma.deadLetterQueue.create({ data: { jobId: job.id, queueId: job.queueId, reason: message, attemptsMade: attempt, payloadSnapshot: job.payload as any, failedAt: new Date() } }),
    ]);
    await settleBatch(job, true);
    logger.error(`Job ${job.id} exhausted ${job.maxAttempts} attempts — moved to Dead Letter Queue`);
  }
}

async function settleBatch(job: Job, failed: boolean) {
  if (!job.batchId) return;
  await prisma.batchJob.update({
    where: { id: job.batchId },
    data: failed ? { failedJobs: { increment: 1 } } : { completedJobs: { increment: 1 } },
  });
}

async function log(jobId: string, jobExecutionId: string, level: "info" | "warn" | "error", message: string) {
  await prisma.executionLog.create({ data: { jobId, jobExecutionId, level, message } });
}

// ------------------------------------------------------------ HEARTBEAT ----
export async function sendHeartbeat(workerId: string, cpuUsage: number, memoryUsage: number, activeJobs: number) {
  await prisma.$transaction([
    prisma.worker.update({ where: { id: workerId }, data: { lastHeartbeatAt: new Date(), cpuUsage, memoryUsage, status: activeJobs > 0 ? "BUSY" : "ONLINE" } }),
    prisma.workerHeartbeat.create({ data: { workerId, cpuUsage, memoryUsage, activeJobs } }),
  ]);
}

/** Promotes SCHEDULED/RETRYING jobs whose runAt has elapsed back into the QUEUED pool. */
export async function promoteDueJobs() {
  await prisma.job.updateMany({
    where: { status: { in: ["SCHEDULED", "RETRYING"] }, runAt: { lte: new Date() } },
    data: { status: "QUEUED" },
  });
}
