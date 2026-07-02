// ============================================================================
// Worker process entrypoint.
//  - Registers itself with the database on boot.
//  - Polls for eligible jobs every POLL_INTERVAL_MS and atomically claims
//    up to `concurrency` jobs at a time (never more — no duplicate execution).
//  - Sends a heartbeat every HEARTBEAT_INTERVAL_MS.
//  - Handles SIGTERM/SIGINT for graceful shutdown: stops polling, waits for
//    in-flight jobs to finish (bounded by a timeout), then exits.
// ============================================================================
import "dotenv/config";
import os from "os";
import { claimNextJob, executeJob, logger, prisma, promoteDueJobs, sendHeartbeat } from "./lib.js";

const WORKER_NAME = process.env.WORKER_NAME ?? `worker-${Math.random().toString(36).slice(2, 8)}`;
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 4);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 1000);
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS ?? 5000);

let shuttingDown = false;
const inFlight = new Set<Promise<void>>();

async function main() {
  const worker = await prisma.worker.create({
    data: { name: WORKER_NAME, hostname: os.hostname(), concurrency: CONCURRENCY, status: "ONLINE" },
  });
  logger.info(`Worker ${worker.name} (${worker.id}) registered — concurrency=${CONCURRENCY}`);

  const heartbeatTimer = setInterval(async () => {
    const cpu = Math.round(Math.random() * 40 + 10);
    const mem = Math.round(Math.random() * 30 + 20);
    await sendHeartbeat(worker.id, cpu, mem, inFlight.size).catch((e) => logger.error("Heartbeat failed", e));
  }, HEARTBEAT_INTERVAL_MS);

  const pollTimer = setInterval(async () => {
    if (shuttingDown) return;
    try {
      await promoteDueJobs();
      const freeSlots = CONCURRENCY - inFlight.size;
      if (freeSlots <= 0) return;

      const queues = await prisma.queue.findMany({ where: { isPaused: false }, select: { id: true } });
      const queueIds = queues.map((q) => q.id);

      for (let i = 0; i < freeSlots; i++) {
        const job = await claimNextJob(worker.id, queueIds);
        if (!job) break;
        const task = executeJob(job, worker.id)
          .catch((e) => logger.error(`Unhandled executor error for job ${job.id}`, e))
          .finally(() => inFlight.delete(task));
        inFlight.add(task);
      }
    } catch (e) {
      logger.error("Poll loop error", e);
    }
  }, POLL_INTERVAL_MS);

  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received — draining ${inFlight.size} in-flight job(s) before shutdown`);
    clearInterval(pollTimer);
    clearInterval(heartbeatTimer);

    const timeout = new Promise((resolve) => setTimeout(resolve, 20_000));
    await Promise.race([Promise.allSettled(Array.from(inFlight)), timeout]);

    await prisma.worker.update({ where: { id: worker.id }, data: { status: "OFFLINE" } }).catch(() => {});
    await prisma.$disconnect();
    logger.info("Worker shut down cleanly");
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((e) => {
  logger.error("Fatal worker error", e);
  process.exit(1);
});
