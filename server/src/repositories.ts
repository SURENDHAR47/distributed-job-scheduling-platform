// ============================================================================
// Repository layer — isolates all Prisma/SQL access behind small, testable
// classes (Repository Pattern). Services depend on these interfaces only,
// which keeps business logic persistence-agnostic and easy to unit test.
// ============================================================================
import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./config.js";

export class UserRepository {
  constructor(private db: PrismaClient = prisma) {}
  findByEmail(email: string) { return this.db.user.findUnique({ where: { email } }); }
  findById(id: string) { return this.db.user.findUnique({ where: { id } }); }
  create(data: { email: string; name: string; passwordHash: string }) { return this.db.user.create({ data }); }
}

export class OrganizationRepository {
  constructor(private db: PrismaClient = prisma) {}
  create(data: { name: string; slug: string; ownerId: string }) { return this.db.organization.create({ data }); }
  findForUser(userId: string) {
    return this.db.organization.findMany({
      where: { members: { some: { userId } } },
      include: { members: true, projects: true },
    });
  }
  addMember(organizationId: string, userId: string, role: "ADMIN" | "DEVELOPER" | "VIEWER") {
    return this.db.organizationMember.upsert({
      where: { organizationId_userId: { organizationId, userId } },
      update: { role },
      create: { organizationId, userId, role },
    });
  }
  members(organizationId: string) {
    return this.db.organizationMember.findMany({ where: { organizationId }, include: { user: true } });
  }
  roleOf(organizationId: string, userId: string) {
    return this.db.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId } } });
  }
}

export class ProjectRepository {
  constructor(private db: PrismaClient = prisma) {}
  create(data: { organizationId: string; name: string; description: string }) { return this.db.project.create({ data }); }
  listByOrg(organizationId: string) {
    return this.db.project.findMany({ where: { organizationId }, include: { _count: { select: { queues: true } } } });
  }
  findById(id: string) { return this.db.project.findUnique({ where: { id } }); }
}

export class QueueRepository {
  constructor(private db: PrismaClient = prisma) {}
  create(data: Prisma.QueueUncheckedCreateInput) { return this.db.queue.create({ data }); }
  findById(id: string) { return this.db.queue.findUnique({ where: { id } }); }
  listByProject(projectId?: string) {
    return this.db.queue.findMany({ where: projectId ? { projectId } : undefined, include: { retryPolicy: true } });
  }
  update(id: string, data: Prisma.QueueUpdateInput) { return this.db.queue.update({ where: { id }, data }); }
  setPaused(id: string, isPaused: boolean) { return this.db.queue.update({ where: { id }, data: { isPaused } }); }
}

export class RetryPolicyRepository {
  constructor(private db: PrismaClient = prisma) {}
  create(data: Prisma.RetryPolicyCreateInput) { return this.db.retryPolicy.create({ data }); }
  findById(id: string) { return this.db.retryPolicy.findUnique({ where: { id } }); }
  list() { return this.db.retryPolicy.findMany(); }
}

export class JobRepository {
  constructor(private db: PrismaClient = prisma) {}

  create(data: Prisma.JobUncheckedCreateInput) { return this.db.job.create({ data }); }
  findById(id: string) { return this.db.job.findUnique({ where: { id }, include: { executions: true, queue: true } }); }

  async list(opts: { queueId?: string; status?: string; type?: string; search?: string; skip: number; take: number; sortBy: string; sortDir: "asc" | "desc" }) {
    const where: Prisma.JobWhereInput = {
      queueId: opts.queueId,
      status: opts.status as any,
      type: opts.type as any,
      name: opts.search ? { contains: opts.search, mode: "insensitive" } : undefined,
    };
    const [data, total] = await Promise.all([
      this.db.job.findMany({ where, skip: opts.skip, take: opts.take, orderBy: { [opts.sortBy]: opts.sortDir } }),
      this.db.job.count({ where }),
    ]);
    return { data, total };
  }

  update(id: string, data: Prisma.JobUpdateInput) { return this.db.job.update({ where: { id }, data }); }
  delete(id: string) { return this.db.job.delete({ where: { id } }); }

  /**
   * ATOMIC JOB CLAIM
   * -----------------------------------------------------------------------
   * Executed by each worker poll cycle. Uses a raw `SELECT ... FOR UPDATE
   * SKIP LOCKED` inside a serializable transaction so concurrent worker
   * processes never claim the same row — Postgres guarantees mutual
   * exclusion at the row level and skips rows already locked by another
   * transaction instead of blocking on them.
   */
  async claimNextJob(workerId: string, queueIds: string[]): Promise<{ id: string } | null> {
    return this.db.$transaction(async (tx) => {
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
      const job = rows[0];
      if (!job) return null;
      await tx.job.update({
        where: { id: job.id },
        data: { status: "CLAIMED", claimedBy: workerId, claimedAt: new Date() },
      });
      return job;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }
}

export class WorkerRepository {
  constructor(private db: PrismaClient = prisma) {}
  register(data: { name: string; hostname: string; concurrency: number }) {
    return this.db.worker.create({ data: { ...data, status: "ONLINE", lastHeartbeatAt: new Date() } });
  }
  list() { return this.db.worker.findMany(); }
  heartbeat(id: string, cpuUsage: number, memoryUsage: number, activeJobs: number) {
    return this.db.$transaction([
      this.db.worker.update({ where: { id }, data: { lastHeartbeatAt: new Date(), cpuUsage, memoryUsage, status: activeJobs > 0 ? "BUSY" : "ONLINE" } }),
      this.db.workerHeartbeat.create({ data: { workerId: id, cpuUsage, memoryUsage, activeJobs } }),
    ]);
  }
  /** Marks workers as OFFLINE if no heartbeat has been received within `staleMs`. */
  markStaleOffline(staleMs: number) {
    return this.db.worker.updateMany({
      where: { lastHeartbeatAt: { lt: new Date(Date.now() - staleMs) }, status: { not: "OFFLINE" } },
      data: { status: "OFFLINE" },
    });
  }
}

export class ExecutionRepository {
  constructor(private db: PrismaClient = prisma) {}
  start(data: Prisma.JobExecutionUncheckedCreateInput) { return this.db.jobExecution.create({ data }); }
  finish(id: string, data: Prisma.JobExecutionUpdateInput) { return this.db.jobExecution.update({ where: { id }, data }); }
  listForJob(jobId: string) { return this.db.jobExecution.findMany({ where: { jobId }, orderBy: { attemptNumber: "desc" } }); }
}

export class LogRepository {
  constructor(private db: PrismaClient = prisma) {}
  write(data: Prisma.ExecutionLogUncheckedCreateInput) { return this.db.executionLog.create({ data }); }
  list(opts: { level?: string; skip: number; take: number }) {
    return this.db.executionLog.findMany({
      where: opts.level ? { level: opts.level as any } : undefined,
      orderBy: { timestamp: "desc" }, skip: opts.skip, take: opts.take,
    });
  }
}

export class DeadLetterRepository {
  constructor(private db: PrismaClient = prisma) {}
  create(data: Prisma.DeadLetterQueueUncheckedCreateInput) { return this.db.deadLetterQueue.create({ data }); }
  list(queueId?: string) { return this.db.deadLetterQueue.findMany({ where: queueId ? { queueId } : undefined, orderBy: { failedAt: "desc" } }); }
  removeByJobId(jobId: string) { return this.db.deadLetterQueue.deleteMany({ where: { jobId } }); }
}

export class RecurringJobRepository {
  constructor(private db: PrismaClient = prisma) {}
  create(data: Prisma.RecurringJobUncheckedCreateInput) { return this.db.recurringJob.create({ data }); }
  dueForDispatch() { return this.db.recurringJob.findMany({ where: { isActive: true, nextRunAt: { lte: new Date() } } }); }
  markDispatched(id: string, nextRunAt: Date) { return this.db.recurringJob.update({ where: { id }, data: { lastRunAt: new Date(), nextRunAt } }); }
}

export class BatchJobRepository {
  constructor(private db: PrismaClient = prisma) {}
  create(data: Prisma.BatchJobUncheckedCreateInput) { return this.db.batchJob.create({ data }); }
  incrementProgress(id: string, failed: boolean) {
    return this.db.batchJob.update({
      where: { id },
      data: failed ? { failedJobs: { increment: 1 } } : { completedJobs: { increment: 1 } },
    });
  }
}
