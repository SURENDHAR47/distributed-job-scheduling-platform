// ============================================================================
// node-cron powered schedulers running inside the API process:
//  1. Dispatches due RecurringJob templates into concrete Job rows.
//  2. Sweeps workers whose heartbeat has gone stale and marks them OFFLINE
//     (worker recovery: a stale worker's CLAIMED/RUNNING jobs are re-queued).
// ============================================================================
import cron from "node-cron";
import { prisma, logger } from "./config.js";
import { WorkerService } from "./services.js";
import { getIO } from "./socket.js";
import { SOCKET_EVENTS } from "../../shared/index.js";

const STALE_HEARTBEAT_MS = 15_000;

export function startSchedulers() {
  // Every 5 seconds: promote due recurring jobs into real job rows.
  cron.schedule("*/5 * * * * *", async () => {
    const due = await prisma.recurringJob.findMany({ where: { isActive: true, nextRunAt: { lte: new Date() } } });
    for (const rec of due) {
      const job = await prisma.job.create({
        data: { queueId: rec.queueId, recurringJobId: rec.id, name: rec.name, type: "RECURRING", payload: rec.payloadTemplate as any, status: "QUEUED", runAt: new Date(), maxAttempts: 3 },
      });
      await prisma.recurringJob.update({ where: { id: rec.id }, data: { lastRunAt: new Date(), nextRunAt: nextCronFireTime(rec.cronExpression) } });
      getIO()?.emit(SOCKET_EVENTS.JOB_CREATED, job);
    }
  });

  // Every 10 seconds: detect dead workers, requeue their in-flight jobs, and
  // notify the dashboard (worker recovery / graceful degradation).
  cron.schedule("*/10 * * * * *", async () => {
    const staleWorkers = await prisma.worker.findMany({ where: { lastHeartbeatAt: { lt: new Date(Date.now() - STALE_HEARTBEAT_MS) }, status: { not: "OFFLINE" } } });
    for (const worker of staleWorkers) {
      await prisma.job.updateMany({ where: { claimedBy: worker.id, status: { in: ["CLAIMED", "RUNNING"] } }, data: { status: "QUEUED", claimedBy: null } });
      await prisma.worker.update({ where: { id: worker.id }, data: { status: "OFFLINE" } });
      logger.warn(`Worker ${worker.name} marked OFFLINE after missed heartbeats — in-flight jobs requeued`);
      getIO()?.emit(SOCKET_EVENTS.WORKER_OFFLINE, worker);
    }
  });

  logger.info("Schedulers started (recurring dispatch @5s, heartbeat sweep @10s)");
}

/** Minimal cron "seconds" support for the demo template; swap for `cron-parser` in production for full expressions. */
function nextCronFireTime(expression: string): Date {
  const match = expression.match(/^\*\/(\d+) \* \* \* \* \*$/);
  const seconds = match ? Number(match[1]) : 60;
  return new Date(Date.now() + seconds * 1000);
}
