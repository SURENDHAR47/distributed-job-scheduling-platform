// ============================================================================
// Service layer — business logic, orchestrating one or more repositories.
// Controllers never touch Prisma directly; they call services.
// ============================================================================
import { computeRetryDelayMs } from "../../shared/index.js";
import {
  UserRepository, OrganizationRepository, ProjectRepository, QueueRepository,
  RetryPolicyRepository, JobRepository, WorkerRepository, ExecutionRepository,
  LogRepository, DeadLetterRepository, RecurringJobRepository, BatchJobRepository,
} from "./repositories.js";
import { ApiError, comparePassword, hashPassword, signAccessToken, signRefreshToken, verifyRefreshToken } from "./utils.js";
import { getIO } from "./socket.js";
import { SOCKET_EVENTS } from "../../shared/index.js";

const userRepo = new UserRepository();
const orgRepo = new OrganizationRepository();
const projectRepo = new ProjectRepository();
const queueRepo = new QueueRepository();
const retryPolicyRepo = new RetryPolicyRepository();
const jobRepo = new JobRepository();
const workerRepo = new WorkerRepository();
const executionRepo = new ExecutionRepository();
const logRepo = new LogRepository();
const dlqRepo = new DeadLetterRepository();
const recurringRepo = new RecurringJobRepository();
const batchRepo = new BatchJobRepository();

// ------------------------------------------------------------------- AUTH ---
export const AuthService = {
  async register(name: string, email: string, password: string) {
    const existing = await userRepo.findByEmail(email);
    if (existing) throw ApiError.conflict("Email already registered");
    const user = await userRepo.create({ name, email, passwordHash: await hashPassword(password) });
    return this.issueTokens(user);
  },
  async login(email: string, password: string) {
    const user = await userRepo.findByEmail(email);
    if (!user || !(await comparePassword(password, user.passwordHash))) throw ApiError.unauthorized("Invalid credentials");
    return this.issueTokens(user);
  },
  async refresh(refreshToken: string) {
    let payload;
    try { payload = verifyRefreshToken(refreshToken); } catch { throw ApiError.unauthorized("Invalid refresh token"); }
    const user = await userRepo.findById(payload.sub);
    if (!user) throw ApiError.unauthorized();
    return this.issueTokens(user);
  },
  issueTokens(user: { id: string; email: string; name: string }) {
    return {
      accessToken: signAccessToken({ sub: user.id, email: user.email }),
      refreshToken: signRefreshToken({ sub: user.id }),
      user: { id: user.id, name: user.name, email: user.email },
    };
  },
};

// ---------------------------------------------------------- ORGANIZATIONS ---
export const OrganizationService = {
  async create(userId: string, name: string) {
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.random().toString(36).slice(2, 6)}`;
    const org = await orgRepo.create({ name, slug, ownerId: userId });
    await orgRepo.addMember(org.id, userId, "ADMIN");
    return org;
  },
  list(userId: string) { return orgRepo.findForUser(userId); },
  async invite(organizationId: string, email: string, role: "ADMIN" | "DEVELOPER" | "VIEWER") {
    let user = await userRepo.findByEmail(email);
    if (!user) user = await userRepo.create({ email, name: email.split("@")[0], passwordHash: await hashPassword(Math.random().toString(36)) });
    return orgRepo.addMember(organizationId, user.id, role);
  },
  members(organizationId: string) { return orgRepo.members(organizationId); },
};

// --------------------------------------------------------------- PROJECTS ---
export const ProjectService = {
  create(organizationId: string, name: string, description: string) { return projectRepo.create({ organizationId, name, description }); },
  list(organizationId: string) { return projectRepo.listByOrg(organizationId); },
};

// --------------------------------------------------------------- RETRY POLICY
export const RetryPolicyService = {
  create: retryPolicyRepo.create.bind(retryPolicyRepo),
  list: retryPolicyRepo.list.bind(retryPolicyRepo),
  /** Pure calculation reused by the worker after a failed attempt. */
  nextDelayMs(strategy: "FIXED" | "LINEAR" | "EXPONENTIAL", attempt: number, baseDelayMs: number, maxDelayMs: number) {
    return computeRetryDelayMs(strategy, attempt, baseDelayMs, maxDelayMs);
  },
};

// ------------------------------------------------------------------ QUEUES ---
export const QueueService = {
  create: queueRepo.create.bind(queueRepo),
  list: queueRepo.listByProject.bind(queueRepo),
  async update(id: string, patch: Record<string, unknown>) {
    const queue = await queueRepo.update(id, patch as any);
    getIO()?.emit(SOCKET_EVENTS.QUEUE_UPDATED, queue);
    return queue;
  },
  async pause(id: string) {
    const queue = await queueRepo.setPaused(id, true);
    getIO()?.emit(SOCKET_EVENTS.QUEUE_PAUSED, queue);
    return queue;
  },
  async resume(id: string) {
    const queue = await queueRepo.setPaused(id, false);
    getIO()?.emit(SOCKET_EVENTS.QUEUE_RESUMED, queue);
    return queue;
  },
};

// -------------------------------------------------------------------- JOBS ---
export const JobService = {
  async create(input: {
    queueId: string; name: string; type: string; payload: Record<string, unknown>;
    priority?: number; maxAttempts?: number; runAt?: string; cronExpression?: string; batchSize?: number;
  }) {
    const queue = await queueRepo.findById(input.queueId);
    if (!queue) throw ApiError.notFound("Queue not found");
    const policy = await retryPolicyRepo.findById(queue.retryPolicyId);
    const maxAttempts = input.maxAttempts ?? policy?.maxAttempts ?? 3;

    if (input.type === "RECURRING") {
      return recurringRepo.create({
        queueId: input.queueId, name: input.name, cronExpression: input.cronExpression!,
        payloadTemplate: input.payload, nextRunAt: new Date(), isActive: true,
      });
    }
    if (input.type === "BATCH") {
      const size = input.batchSize ?? 5;
      const batch = await batchRepo.create({ queueId: input.queueId, name: input.name, totalJobs: size, status: "PENDING" });
      await Promise.all(Array.from({ length: size }).map((_, i) =>
        jobRepo.create({ queueId: input.queueId, batchId: batch.id, name: `${input.name} #${i + 1}`, type: "BATCH", payload: input.payload, maxAttempts, priority: input.priority ?? queue.priority, runAt: new Date() })
      ));
      return batch;
    }

    const isDeferred = input.type === "DELAYED" || input.type === "SCHEDULED";
    const job = await jobRepo.create({
      queueId: input.queueId, name: input.name, type: input.type as any, payload: input.payload,
      maxAttempts, priority: input.priority ?? queue.priority,
      runAt: isDeferred ? new Date(input.runAt!) : new Date(),
      status: isDeferred ? "SCHEDULED" : "QUEUED",
    });
    getIO()?.emit(SOCKET_EVENTS.JOB_CREATED, job);
    return job;
  },

  list(opts: { queueId?: string; status?: string; type?: string; search?: string; skip: number; take: number; sortBy: string; sortDir: "asc" | "desc" }) {
    return jobRepo.list(opts);
  },
  get(id: string) { return jobRepo.findById(id); },
  executions(jobId: string) { return executionRepo.listForJob(jobId); },

  async delete(id: string) {
    const job = await jobRepo.findById(id);
    if (!job) throw ApiError.notFound("Job not found");
    if (job.status === "RUNNING" || job.status === "CLAIMED") throw ApiError.conflict("Cannot delete a job currently executing");
    await jobRepo.delete(id);
  },

  async retry(id: string) {
    const job = await jobRepo.findById(id);
    if (!job) throw ApiError.notFound("Job not found");
    if (job.status !== "FAILED" && job.status !== "DEAD_LETTER") throw ApiError.conflict("Only FAILED or DEAD_LETTER jobs can be retried");
    await dlqRepo.removeByJobId(id);
    const updated = await jobRepo.update(id, { status: "QUEUED", runAt: new Date(), lastError: null, claimedBy: null });
    getIO()?.emit(SOCKET_EVENTS.JOB_UPDATED, updated);
    return updated;
  },
};

export const WorkerService = {
  register: workerRepo.register.bind(workerRepo),
  list: workerRepo.list.bind(workerRepo),
  heartbeat: workerRepo.heartbeat.bind(workerRepo),
  markStaleOffline: workerRepo.markStaleOffline.bind(workerRepo),
};

export const LogService = { list: logRepo.list.bind(logRepo) };
export const DeadLetterService = { list: dlqRepo.list.bind(dlqRepo) };

// ---------------------------------------------------------------- METRICS ---
export const MetricsService = {
  async summary() {
    // In production this aggregates via SQL `GROUP BY status` + heartbeat
    // tables; see docs/API.md for the exact queries.
    const [jobs, workers] = await Promise.all([jobRepo.list({ skip: 0, take: 100000, sortBy: "createdAt", sortDir: "desc" }), workerRepo.list()]);
    const byStatus = (s: string) => jobs.data.filter((j) => j.status === s).length;
    const completed = byStatus("COMPLETED");
    const failed = byStatus("FAILED");
    const dead = byStatus("DEAD_LETTER");
    const running = byStatus("RUNNING") + byStatus("CLAIMED");
    const durations = jobs.data.filter((j) => j.durationMs != null).map((j) => j.durationMs as number);
    const attempted = jobs.data.filter((j) => j.attempts > 0);
    const retried = jobs.data.filter((j) => j.attempts > 1);
    const online = workers.filter((w) => w.status !== "OFFLINE");
    const busy = workers.filter((w) => w.status === "BUSY");
    return {
      totalJobs: jobs.total, runningJobs: running, completedJobs: completed, failedJobs: failed, deadLetterJobs: dead,
      activeWorkers: online.length, totalWorkers: workers.length,
      avgExecutionTimeMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      successRate: attempted.length ? Math.round((completed / (completed + failed + dead || 1)) * 100) : 100,
      retryRate: attempted.length ? Math.round((retried.length / attempted.length) * 100) : 0,
      workerUtilization: online.length ? Math.round((busy.length / online.length) * 100) : 0,
    };
  },
};
