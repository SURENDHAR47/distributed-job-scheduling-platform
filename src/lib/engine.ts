// ============================================================================
// PULSAR SIMULATION ENGINE
// ----------------------------------------------------------------------------
// This module runs an in-browser, fully deterministic simulation of the
// Pulsar backend (Express + PostgreSQL + Worker fleet) described in
// /server, /worker and /database. It exists so the dashboard is a fully
// interactive, self-contained demo without requiring a live Postgres
// instance inside this sandbox.
//
// Every method below is a 1:1 stand-in for a real REST endpoint / worker
// routine documented in /docs/API.md and /server/src. The comments map each
// simulated operation to its production equivalent (SQL, transaction, etc).
// ============================================================================

import type {
  User, Organization, OrganizationMember, Project, Queue, RetryPolicy, Job,
  RecurringJob, BatchJob, JobExecution, Worker, WorkerHeartbeat, ExecutionLog,
  DeadLetterEntry, JobStatus, JobType, Role, QueueStats, GlobalMetrics,
  Paginated, AuthSession, RetryStrategy, LogLevel,
} from "../types";

// ----------------------------------------------------------------------------
// Utilities
// ----------------------------------------------------------------------------
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

/** Simulates bcrypt.hash(password, 10) — deterministic pseudo-hash for the demo. */
function fakeHash(password: string): string {
  let h = 0;
  for (let i = 0; i < password.length; i++) h = (h * 31 + password.charCodeAt(i)) >>> 0;
  return `sim$${h.toString(16)}$${password.length}`;
}
function fakeCompare(password: string, hash: string) {
  return fakeHash(password) === hash;
}

/** Simulates a signed JWT (HS256) — base64url(header.payload.signature). */
function signToken(payload: object, ttlSeconds: number) {
  const body = { ...payload, iat: Date.now(), exp: Date.now() + ttlSeconds * 1000 };
  return `sim.${btoa(JSON.stringify(body))}.${Math.random().toString(36).slice(2)}`;
}
function decodeToken<T = any>(token: string): T | null {
  try {
    const [, body] = token.split(".");
    const parsed = JSON.parse(atob(body));
    if (parsed.exp < Date.now()) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

export type EventName =
  | "job:created" | "job:updated" | "job:completed" | "job:failed" | "job:dead_letter"
  | "queue:paused" | "queue:resumed" | "queue:updated"
  | "worker:online" | "worker:offline" | "worker:heartbeat"
  | "log:new" | "state:sync";

type Listener = (payload: any) => void;

class EventBus {
  private listeners = new Map<EventName, Set<Listener>>();
  on(event: EventName, cb: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return () => this.listeners.get(event)!.delete(cb);
  }
  emit(event: EventName, payload?: any) {
    this.listeners.get(event)?.forEach((cb) => cb(payload));
  }
}

// ----------------------------------------------------------------------------
// Retry strategy calculators — mirrors server/src/services.ts computeNextDelay()
// ----------------------------------------------------------------------------
export function computeRetryDelayMs(strategy: RetryStrategy, attempt: number, base: number, max: number) {
  let delay: number;
  if (strategy === "FIXED") delay = base;
  else if (strategy === "LINEAR") delay = base * attempt;
  else delay = base * Math.pow(2, attempt - 1); // EXPONENTIAL
  return Math.min(delay, max);
}

// ----------------------------------------------------------------------------
// Pagination / filtering / sorting helper — mirrors server/src/utils.ts
// ----------------------------------------------------------------------------
export function paginate<T extends Record<string, any>>(
  rows: T[],
  opts: { page?: number; pageSize?: number; sortBy?: string; sortDir?: "asc" | "desc"; filter?: (r: T) => boolean }
): Paginated<T> {
  let data = opts.filter ? rows.filter(opts.filter) : rows.slice();
  if (opts.sortBy) {
    const dir = opts.sortDir === "asc" ? 1 : -1;
    data.sort((a, b) => (a[opts.sortBy!] > b[opts.sortBy!] ? 1 : a[opts.sortBy!] < b[opts.sortBy!] ? -1 : 0) * dir);
  }
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const total = data.length;
  const start = (page - 1) * pageSize;
  return { data: data.slice(start, start + pageSize), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

// ----------------------------------------------------------------------------
// The Engine
// ----------------------------------------------------------------------------
class PulsarEngine {
  bus = new EventBus();

  users: User[] = [];
  organizations: Organization[] = [];
  members: OrganizationMember[] = [];
  projects: Project[] = [];
  retryPolicies: RetryPolicy[] = [];
  queues: Queue[] = [];
  jobs: Job[] = [];
  recurringJobs: RecurringJob[] = [];
  batchJobs: BatchJob[] = [];
  executions: JobExecution[] = [];
  workers: Worker[] = [];
  heartbeats: WorkerHeartbeat[] = [];
  logs: ExecutionLog[] = [];
  dlq: DeadLetterEntry[] = [];

  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private simulateFailureRate = 0.22;

  constructor() {
    this.seed();
    this.startLoop();
  }

  // ---------------------------------------------------------------- AUTH ---
  async register(email: string, name: string, password: string): Promise<AuthSession> {
    await this.latency();
    if (this.users.find((u) => u.email === email)) throw new ApiError(409, "Email already registered");
    const user: User = { id: uid(), email, name, passwordHash: fakeHash(password), createdAt: now(), updatedAt: now() };
    this.users.push(user);
    return this.issueSession(user);
  }

  async login(email: string, password: string): Promise<AuthSession> {
    await this.latency();
    const user = this.users.find((u) => u.email === email);
    if (!user || !fakeCompare(password, user.passwordHash)) throw new ApiError(401, "Invalid credentials");
    return this.issueSession(user);
  }

  refresh(refreshToken: string): AuthSession {
    const payload = decodeToken<{ sub: string }>(refreshToken);
    if (!payload) throw new ApiError(401, "Refresh token expired");
    const user = this.users.find((u) => u.id === payload.sub);
    if (!user) throw new ApiError(401, "Invalid refresh token");
    return this.issueSession(user);
  }

  private issueSession(user: User): AuthSession {
    const token = signToken({ sub: user.id, email: user.email }, 60 * 15);
    const refreshToken = signToken({ sub: user.id }, 60 * 60 * 24 * 7);
    return { token, refreshToken, user };
  }

  sessionFromToken(token: string | null): User | null {
    if (!token) return null;
    const payload = decodeToken<{ sub: string }>(token);
    if (!payload) return null;
    return this.users.find((u) => u.id === payload.sub) ?? null;
  }

  roleOf(userId: string, organizationId: string): Role | null {
    return this.members.find((m) => m.userId === userId && m.organizationId === organizationId)?.role ?? null;
  }

  // ---------------------------------------------------------- ORGANIZATIONS ---
  async createOrganization(userId: string, name: string): Promise<Organization> {
    await this.latency();
    const org: Organization = {
      id: uid(), name, slug: name.toLowerCase().replace(/\s+/g, "-") + "-" + uid().slice(0, 4),
      ownerId: userId, createdAt: now(), updatedAt: now(),
    };
    this.organizations.push(org);
    this.members.push({ id: uid(), organizationId: org.id, userId, role: "ADMIN", createdAt: now(), updatedAt: now() });
    return org;
  }

  listOrganizations(userId: string): (Organization & { role: Role; memberCount: number; projectCount: number })[] {
    const orgIds = this.members.filter((m) => m.userId === userId).map((m) => m.organizationId);
    return this.organizations
      .filter((o) => orgIds.includes(o.id))
      .map((o) => ({
        ...o,
        role: this.roleOf(userId, o.id)!,
        memberCount: this.members.filter((m) => m.organizationId === o.id).length,
        projectCount: this.projects.filter((p) => p.organizationId === o.id).length,
      }));
  }

  async inviteMember(organizationId: string, email: string, role: Role): Promise<OrganizationMember> {
    await this.latency();
    let user = this.users.find((u) => u.email === email);
    if (!user) {
      user = { id: uid(), email, name: email.split("@")[0], passwordHash: fakeHash("changeme123"), createdAt: now(), updatedAt: now() };
      this.users.push(user);
    }
    const existing = this.members.find((m) => m.organizationId === organizationId && m.userId === user!.id);
    if (existing) { existing.role = role; existing.updatedAt = now(); return existing; }
    const member: OrganizationMember = { id: uid(), organizationId, userId: user.id, role, createdAt: now(), updatedAt: now() };
    this.members.push(member);
    return member;
  }

  listMembers(organizationId: string) {
    return this.members
      .filter((m) => m.organizationId === organizationId)
      .map((m) => ({ ...m, user: this.users.find((u) => u.id === m.userId)! }));
  }

  updateMemberRole(memberId: string, role: Role) {
    const m = this.members.find((x) => x.id === memberId);
    if (!m) throw new ApiError(404, "Member not found");
    m.role = role; m.updatedAt = now();
    return m;
  }

  removeMember(memberId: string) {
    this.members = this.members.filter((m) => m.id !== memberId);
  }

  // ---------------------------------------------------------------- PROJECTS ---
  async createProject(organizationId: string, name: string, description: string): Promise<Project> {
    await this.latency();
    const project: Project = { id: uid(), organizationId, name, description, createdAt: now(), updatedAt: now() };
    this.projects.push(project);
    return project;
  }

  listProjects(organizationId: string) {
    return this.projects
      .filter((p) => p.organizationId === organizationId)
      .map((p) => ({ ...p, queueCount: this.queues.filter((q) => q.projectId === p.id).length }));
  }

  getProject(id: string) {
    const p = this.projects.find((x) => x.id === id);
    if (!p) throw new ApiError(404, "Project not found");
    return p;
  }

  // ------------------------------------------------------------ RETRY POLICY ---
  async createRetryPolicy(input: Omit<RetryPolicy, "id" | "createdAt" | "updatedAt">): Promise<RetryPolicy> {
    await this.latency();
    const rp: RetryPolicy = { id: uid(), createdAt: now(), updatedAt: now(), ...input };
    this.retryPolicies.push(rp);
    return rp;
  }
  listRetryPolicies() { return this.retryPolicies; }

  // ------------------------------------------------------------------ QUEUES ---
  async createQueue(input: {
    projectId: string; name: string; description: string; priority: number;
    concurrencyLimit: number; retryPolicyId: string;
  }): Promise<Queue> {
    await this.latency();
    const queue: Queue = { id: uid(), isPaused: false, createdAt: now(), updatedAt: now(), ...input };
    this.queues.push(queue);
    return queue;
  }

  listQueues(projectId?: string) {
    const rows = projectId ? this.queues.filter((q) => q.projectId === projectId) : this.queues;
    return rows.map((q) => ({ ...q, stats: this.queueStats(q.id) }));
  }

  getQueue(id: string) {
    const q = this.queues.find((x) => x.id === id);
    if (!q) throw new ApiError(404, "Queue not found");
    return q;
  }

  async updateQueue(id: string, patch: Partial<Pick<Queue, "name" | "description" | "priority" | "concurrencyLimit" | "retryPolicyId">>) {
    await this.latency();
    const q = this.getQueue(id);
    Object.assign(q, patch, { updatedAt: now() });
    this.bus.emit("queue:updated", q);
    return q;
  }

  async pauseQueue(id: string) {
    await this.latency();
    const q = this.getQueue(id);
    q.isPaused = true; q.updatedAt = now();
    this.bus.emit("queue:paused", q);
    return q;
  }

  async resumeQueue(id: string) {
    await this.latency();
    const q = this.getQueue(id);
    q.isPaused = false; q.updatedAt = now();
    this.bus.emit("queue:resumed", q);
    return q;
  }

  queueStats(queueId: string): QueueStats {
    const jobs = this.jobs.filter((j) => j.queueId === queueId);
    const completed = jobs.filter((j) => j.status === "COMPLETED");
    const failed = jobs.filter((j) => j.status === "FAILED");
    const dead = jobs.filter((j) => j.status === "DEAD_LETTER");
    const attempted = jobs.filter((j) => j.attempts > 0);
    const retried = jobs.filter((j) => j.attempts > 1);
    const durations = completed.filter((j) => j.durationMs != null).map((j) => j.durationMs as number);
    const recentCompleted = completed.filter((j) => j.completedAt && Date.now() - new Date(j.completedAt).getTime() < 60_000);
    return {
      queueId,
      queued: jobs.filter((j) => j.status === "QUEUED").length,
      scheduled: jobs.filter((j) => j.status === "SCHEDULED" || j.status === "RETRYING").length,
      running: jobs.filter((j) => j.status === "RUNNING" || j.status === "CLAIMED").length,
      completed: completed.length,
      failed: failed.length,
      deadLetter: dead.length,
      throughputPerMin: recentCompleted.length,
      successRate: attempted.length ? Math.round((completed.length / (completed.length + failed.length + dead.length || 1)) * 100) : 100,
      retryRate: attempted.length ? Math.round((retried.length / attempted.length) * 100) : 0,
      avgDurationMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    };
  }

  // -------------------------------------------------------------------- JOBS ---
  async createJob(input: {
    queueId: string; name: string; type: JobType; payload: Record<string, unknown>;
    priority?: number; maxAttempts?: number; runAt?: string; cronExpression?: string; batchSize?: number;
  }): Promise<Job | BatchJob> {
    await this.latency();
    const queue = this.getQueue(input.queueId);
    const policy = this.retryPolicies.find((p) => p.id === queue.retryPolicyId)!;

    if (input.type === "RECURRING") {
      if (!input.cronExpression) throw new ApiError(400, "cronExpression is required for recurring jobs");
      const rec: RecurringJob = {
        id: uid(), queueId: input.queueId, name: input.name, cronExpression: input.cronExpression,
        cronHuman: describeCron(input.cronExpression), payloadTemplate: input.payload, isActive: true,
        nextRunAt: new Date(Date.now() + cronIntervalMs(input.cronExpression)).toISOString(),
        lastRunAt: null, createdAt: now(), updatedAt: now(),
      };
      this.recurringJobs.push(rec);
      this.instantiateJob(rec, true);
      return rec as unknown as Job;
    }

    if (input.type === "BATCH") {
      const size = input.batchSize ?? 5;
      const batch: BatchJob = { id: uid(), queueId: input.queueId, name: input.name, totalJobs: size, completedJobs: 0, failedJobs: 0, status: "PENDING", createdAt: now(), updatedAt: now() };
      this.batchJobs.push(batch);
      for (let i = 0; i < size; i++) {
        this.createJobRow({
          queueId: input.queueId, name: `${input.name} #${i + 1}`, type: "BATCH",
          payload: input.payload, priority: input.priority ?? queue.priority, maxAttempts: input.maxAttempts ?? policy.maxAttempts,
          runAt: now(), batchId: batch.id,
        });
      }
      return batch;
    }

    let runAt = now();
    let status: JobStatus = "QUEUED";
    if (input.type === "DELAYED" || input.type === "SCHEDULED") {
      if (!input.runAt) throw new ApiError(400, "runAt is required for delayed/scheduled jobs");
      runAt = input.runAt;
      status = "SCHEDULED";
    }
    const job = this.createJobRow({
      queueId: input.queueId, name: input.name, type: input.type, payload: input.payload,
      priority: input.priority ?? queue.priority, maxAttempts: input.maxAttempts ?? policy.maxAttempts, runAt, status,
    });
    return job;
  }

  private createJobRow(input: Partial<Job> & { queueId: string; name: string; type: JobType; payload: Record<string, unknown>; maxAttempts: number; runAt: string }) {
    const job: Job = {
      id: uid(), queueId: input.queueId, batchId: input.batchId ?? null, recurringJobId: input.recurringJobId ?? null,
      name: input.name, type: input.type, status: input.status ?? "QUEUED", payload: input.payload,
      priority: input.priority ?? 5, attempts: 0, maxAttempts: input.maxAttempts, runAt: input.runAt,
      claimedBy: null, claimedAt: null, startedAt: null, completedAt: null, lastError: null, durationMs: null,
      createdAt: now(), updatedAt: now(),
    };
    this.jobs.push(job);
    this.bus.emit("job:created", job);
    return job;
  }

  private instantiateJob(rec: RecurringJob, _first = false) {
    const queue = this.getQueue(rec.queueId);
    const policy = this.retryPolicies.find((p) => p.id === queue.retryPolicyId)!;
    return this.createJobRow({
      queueId: rec.queueId, name: rec.name, type: "RECURRING", payload: rec.payloadTemplate,
      priority: queue.priority, maxAttempts: policy.maxAttempts, runAt: now(), recurringJobId: rec.id,
    });
  }

  listJobs(opts: { queueId?: string; status?: JobStatus; type?: JobType; page?: number; pageSize?: number; sortBy?: string; sortDir?: "asc" | "desc"; search?: string }) {
    return paginate(this.jobs, {
      page: opts.page, pageSize: opts.pageSize, sortBy: opts.sortBy ?? "createdAt", sortDir: opts.sortDir ?? "desc",
      filter: (j) =>
        (!opts.queueId || j.queueId === opts.queueId) &&
        (!opts.status || j.status === opts.status) &&
        (!opts.type || j.type === opts.type) &&
        (!opts.search || j.name.toLowerCase().includes(opts.search.toLowerCase())),
    });
  }

  getJob(id: string) {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) throw new ApiError(404, "Job not found");
    return job;
  }

  getJobExecutions(jobId: string) {
    return this.executions.filter((e) => e.jobId === jobId).sort((a, b) => b.attemptNumber - a.attemptNumber);
  }
  getJobLogs(jobId: string) {
    return this.logs.filter((l) => l.jobId === jobId).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  async deleteJob(id: string) {
    await this.latency();
    const job = this.getJob(id);
    if (job.status === "RUNNING" || job.status === "CLAIMED") throw new ApiError(409, "Cannot delete a job that is currently executing");
    this.jobs = this.jobs.filter((j) => j.id !== id);
  }

  async retryJob(id: string) {
    await this.latency();
    const job = this.getJob(id);
    if (job.status !== "FAILED" && job.status !== "DEAD_LETTER") throw new ApiError(409, "Only failed or dead-lettered jobs can be retried");
    job.status = "QUEUED";
    job.runAt = now();
    job.lastError = null;
    job.claimedBy = null;
    job.updatedAt = now();
    this.dlq = this.dlq.filter((d) => d.jobId !== id);
    this.log(job.id, "info", `Manual retry requested — attempt ${job.attempts + 1}/${job.maxAttempts}`);
    this.bus.emit("job:updated", job);
    return job;
  }

  async cancelJob(id: string) {
    await this.latency();
    const job = this.getJob(id);
    job.status = "CANCELLED"; job.updatedAt = now();
    this.bus.emit("job:updated", job);
    return job;
  }

  listDeadLetter(queueId?: string) {
    const rows = queueId ? this.dlq.filter((d) => d.queueId === queueId) : this.dlq;
    return rows.sort((a, b) => b.failedAt.localeCompare(a.failedAt));
  }

  // ----------------------------------------------------------------- WORKERS ---
  listWorkers() { return this.workers; }

  registerWorker(name: string, concurrency = 2): Worker {
    const w: Worker = {
      id: uid(), name, hostname: `${name.toLowerCase().replace(/\s+/g, "-")}.local`, status: "ONLINE",
      concurrency, activeJobIds: [], lastHeartbeatAt: now(), cpuUsage: rand(5, 20), memoryUsage: rand(20, 40),
      createdAt: now(), updatedAt: now(),
    };
    this.workers.push(w);
    this.bus.emit("worker:online", w);
    return w;
  }

  // ------------------------------------------------------------------- LOGS ---
  listLogs(opts: { level?: LogLevel; page?: number; pageSize?: number }) {
    return paginate(this.logs.slice().reverse(), { page: opts.page, pageSize: opts.pageSize, filter: (l) => !opts.level || l.level === opts.level });
  }

  private log(jobId: string, level: LogLevel, message: string, jobExecutionId = "") {
    const entry: ExecutionLog = { id: uid(), jobExecutionId, jobId, level, message, timestamp: now() };
    this.logs.push(entry);
    if (this.logs.length > 2000) this.logs.shift();
    this.bus.emit("log:new", entry);
    return entry;
  }

  // ---------------------------------------------------------------- METRICS ---
  metrics(): GlobalMetrics {
    const completed = this.jobs.filter((j) => j.status === "COMPLETED");
    const failed = this.jobs.filter((j) => j.status === "FAILED");
    const dead = this.jobs.filter((j) => j.status === "DEAD_LETTER");
    const running = this.jobs.filter((j) => j.status === "RUNNING" || j.status === "CLAIMED");
    const durations = completed.filter((j) => j.durationMs != null).map((j) => j.durationMs as number);
    const attempted = this.jobs.filter((j) => j.attempts > 0);
    const retried = this.jobs.filter((j) => j.attempts > 1);
    const recentCompleted = completed.filter((j) => j.completedAt && Date.now() - new Date(j.completedAt).getTime() < 60_000);
    const onlineWorkers = this.workers.filter((w) => w.status !== "OFFLINE");
    const busyWorkers = this.workers.filter((w) => w.status === "BUSY");
    return {
      totalJobs: this.jobs.length,
      runningJobs: running.length,
      failedJobs: failed.length,
      completedJobs: completed.length,
      deadLetterJobs: dead.length,
      activeWorkers: onlineWorkers.length,
      totalWorkers: this.workers.length,
      avgExecutionTimeMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      throughputPerMin: recentCompleted.length,
      successRate: attempted.length ? Math.round((completed.length / (completed.length + failed.length + dead.length || 1)) * 100) : 100,
      retryRate: attempted.length ? Math.round((retried.length / attempted.length) * 100) : 0,
      workerUtilization: onlineWorkers.length ? Math.round((busyWorkers.length / onlineWorkers.length) * 100) : 0,
      cpuUsage: onlineWorkers.length ? Math.round(onlineWorkers.reduce((a, w) => a + w.cpuUsage, 0) / onlineWorkers.length) : 0,
    };
  }

  throughputSeries(minutes = 20) {
    const buckets: { t: string; completed: number; failed: number }[] = [];
    const bucketMs = 60_000;
    const nowMs = Date.now();
    for (let i = minutes - 1; i >= 0; i--) {
      const bucketStart = nowMs - i * bucketMs;
      const bucketEnd = bucketStart + bucketMs;
      const completed = this.jobs.filter((j) => j.completedAt && +new Date(j.completedAt) >= bucketStart && +new Date(j.completedAt) < bucketEnd && j.status === "COMPLETED").length;
      const failedCount = this.jobs.filter((j) => j.completedAt && +new Date(j.completedAt) >= bucketStart && +new Date(j.completedAt) < bucketEnd && (j.status === "FAILED" || j.status === "DEAD_LETTER")).length;
      buckets.push({ t: new Date(bucketStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), completed, failed: failedCount });
    }
    return buckets;
  }

  private latency() { return new Promise((r) => setTimeout(r, 120 + Math.random() * 180)); }

  // ============================================================= WORKER LOOP ===
  // Simulates: 1) node-cron scheduler dispatch, 2) worker fleet polling with
  // atomic SELECT ... FOR UPDATE SKIP LOCKED claiming, 3) execution + retry.
  private startLoop() {
    this.tickHandle = setInterval(() => this.tick(), 900);
  }
  stopLoop() { if (this.tickHandle) clearInterval(this.tickHandle); }

  private tick() {
    const t = now();

    // 1. Recurring job dispatcher (node-cron equivalent)
    for (const rec of this.recurringJobs) {
      if (rec.isActive && new Date(rec.nextRunAt).getTime() <= Date.now()) {
        this.instantiateJob(rec);
        rec.lastRunAt = t;
        rec.nextRunAt = new Date(Date.now() + cronIntervalMs(rec.cronExpression)).toISOString();
      }
    }

    // 2. Promote SCHEDULED/RETRYING jobs whose runAt has elapsed -> QUEUED
    for (const job of this.jobs) {
      if ((job.status === "SCHEDULED" || job.status === "RETRYING") && new Date(job.runAt).getTime() <= Date.now()) {
        job.status = "QUEUED";
        job.updatedAt = t;
      }
    }

    // 3. Worker heartbeats + flakiness simulation (recovery demo)
    for (const w of this.workers) {
      if (w.status === "OFFLINE") {
        if (Math.random() < 0.08) {
          w.status = "ONLINE";
          w.updatedAt = t;
          this.bus.emit("worker:online", w);
        }
        continue;
      }
      if (Math.random() < 0.015 && w.activeJobIds.length === 0) {
        w.status = "OFFLINE";
        w.updatedAt = t;
        this.bus.emit("worker:offline", w);
        continue;
      }
      w.lastHeartbeatAt = t;
      w.cpuUsage = clamp(w.cpuUsage + rand(-6, 6), 3, 96);
      w.memoryUsage = clamp(w.memoryUsage + rand(-4, 4), 10, 90);
      const hb: WorkerHeartbeat = { id: uid(), workerId: w.id, cpuUsage: w.cpuUsage, memoryUsage: w.memoryUsage, activeJobs: w.activeJobIds.length, timestamp: t };
      this.heartbeats.push(hb);
      if (this.heartbeats.length > 1000) this.heartbeats.shift();
      this.bus.emit("worker:heartbeat", w);
    }

    // 4. Claim + execute: each idle worker slot attempts to atomically claim one job.
    //    Production equivalent (server/src -> worker/src/claim.ts):
    //      BEGIN;
    //      SELECT * FROM jobs WHERE status='QUEUED' AND queue_id = ANY(assigned)
    //        ORDER BY priority DESC, run_at ASC FOR UPDATE SKIP LOCKED LIMIT 1;
    //      UPDATE jobs SET status='CLAIMED', claimed_by=$worker, claimed_at=now();
    //      COMMIT;
    const availableWorkers = this.workers.filter((w) => w.status !== "OFFLINE" && w.activeJobIds.length < w.concurrency);
    for (const w of availableWorkers) {
      const slotsFree = w.concurrency - w.activeJobIds.length;
      for (let s = 0; s < slotsFree; s++) {
        const candidate = this.claimNextJob();
        if (!candidate) break;
        this.beginExecution(candidate, w);
      }
    }

    // 5. Progress running jobs
    for (const job of this.jobs.filter((j) => j.status === "RUNNING")) {
      const exec = this.executions.find((e) => e.jobId === job.id && e.status === "RUNNING");
      if (!exec) continue;
      const elapsed = Date.now() - new Date(exec.startedAt).getTime();
      const target = (job.payload.durationMs as number) || rand(1500, 4500);
      if (elapsed >= target) this.finishExecution(job, exec, target);
    }

    this.bus.emit("state:sync", null);
  }

  /** Atomically claims the highest-priority eligible job across non-paused queues. SKIP LOCKED analog. */
  private claimNextJob(): Job | null {
    const eligible = this.jobs
      .filter((j) => j.status === "QUEUED" && !this.getQueue(j.queueId).isPaused)
      .filter((j) => {
        const q = this.getQueue(j.queueId);
        const inFlight = this.jobs.filter((x) => x.queueId === q.id && (x.status === "RUNNING" || x.status === "CLAIMED")).length;
        return inFlight < q.concurrencyLimit;
      })
      .sort((a, b) => b.priority - a.priority || +new Date(a.runAt) - +new Date(b.runAt));
    return eligible[0] ?? null;
  }

  private beginExecution(job: Job, worker: Worker) {
    job.status = "CLAIMED";
    job.claimedBy = worker.id;
    job.claimedAt = now();
    job.updatedAt = now();
    worker.activeJobIds.push(job.id);
    worker.status = "BUSY";
    this.bus.emit("job:updated", job);

    // Transition CLAIMED -> RUNNING on next tick to reflect real dispatch latency
    setTimeout(() => {
      if (job.status !== "CLAIMED") return;
      job.status = "RUNNING";
      job.startedAt = now();
      job.attempts += 1;
      job.updatedAt = now();
      const exec: JobExecution = {
        id: uid(), jobId: job.id, workerId: worker.id, attemptNumber: job.attempts, status: "RUNNING",
        startedAt: job.startedAt, completedAt: null, durationMs: null, errorMessage: null, errorStack: null,
        createdAt: now(), updatedAt: now(),
      };
      this.executions.push(exec);
      this.log(job.id, "info", `Worker ${worker.name} started attempt ${job.attempts}/${job.maxAttempts}`, exec.id);
      this.bus.emit("job:updated", job);
    }, 250);
  }

  private finishExecution(job: Job, exec: JobExecution, durationMs: number) {
    const worker = this.workers.find((w) => w.id === job.claimedBy);
    const forcedFail = job.payload.forceFail === true;
    const willFail = forcedFail || Math.random() < this.simulateFailureRate;

    exec.completedAt = now();
    exec.durationMs = durationMs;
    exec.updatedAt = now();

    if (!willFail) {
      exec.status = "COMPLETED";
      job.status = "COMPLETED";
      job.completedAt = now();
      job.durationMs = durationMs;
      job.updatedAt = now();
      this.log(job.id, "info", `Completed successfully in ${durationMs}ms`, exec.id);
      this.bus.emit("job:completed", job);
      this.settleBatch(job);
    } else {
      const errorMessage = pickError();
      exec.status = "FAILED";
      exec.errorMessage = errorMessage;
      exec.errorStack = `Error: ${errorMessage}\n    at JobExecutor.run (worker/src/executor.ts:42:11)\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)`;
      job.lastError = errorMessage;
      this.log(job.id, "error", `Attempt ${job.attempts} failed: ${errorMessage}`, exec.id);

      const queue = this.getQueue(job.queueId);
      const policy = this.retryPolicies.find((p) => p.id === queue.retryPolicyId)!;

      if (job.attempts < job.maxAttempts) {
        const delay = computeRetryDelayMs(policy.strategy, job.attempts, policy.baseDelayMs, policy.maxDelayMs);
        job.status = "RETRYING";
        job.runAt = new Date(Date.now() + delay).toISOString();
        job.claimedBy = null;
        job.updatedAt = now();
        this.log(job.id, "warn", `Scheduling retry ${job.attempts + 1}/${job.maxAttempts} in ${delay}ms (${policy.strategy})`, exec.id);
        this.bus.emit("job:failed", job);
      } else {
        job.status = "DEAD_LETTER";
        job.updatedAt = now();
        this.dlq.push({
          id: uid(), jobId: job.id, queueId: job.queueId, reason: errorMessage, attemptsMade: job.attempts,
          payloadSnapshot: job.payload, failedAt: now(), createdAt: now(),
        });
        this.log(job.id, "error", `Exhausted ${job.maxAttempts} attempts — moved to Dead Letter Queue`, exec.id);
        this.bus.emit("job:dead_letter", job);
        this.settleBatch(job, true);
      }
    }

    if (worker) {
      worker.activeJobIds = worker.activeJobIds.filter((id) => id !== job.id);
      if (worker.activeJobIds.length === 0) worker.status = "ONLINE";
    }
  }

  private settleBatch(job: Job, isFailure = false) {
    if (!job.batchId) return;
    const batch = this.batchJobs.find((b) => b.id === job.batchId);
    if (!batch) return;
    if (isFailure) batch.failedJobs += 1; else batch.completedJobs += 1;
    batch.status = batch.completedJobs + batch.failedJobs >= batch.totalJobs
      ? (batch.failedJobs > 0 ? "PARTIAL_FAILURE" : "COMPLETED")
      : "RUNNING";
    batch.updatedAt = now();
  }

  // ------------------------------------------------------------------- SEED ---
  private seed() {
    const admin: User = { id: uid(), email: "admin@pulsar.dev", name: "Ada Admin", passwordHash: fakeHash("password123"), createdAt: now(), updatedAt: now() };
    const dev: User = { id: uid(), email: "dev@pulsar.dev", name: "Dana Developer", passwordHash: fakeHash("password123"), createdAt: now(), updatedAt: now() };
    const viewer: User = { id: uid(), email: "viewer@pulsar.dev", name: "Vic Viewer", passwordHash: fakeHash("password123"), createdAt: now(), updatedAt: now() };
    this.users.push(admin, dev, viewer);

    const org: Organization = { id: uid(), name: "Pulsar Labs", slug: "pulsar-labs", ownerId: admin.id, createdAt: now(), updatedAt: now() };
    this.organizations.push(org);
    this.members.push(
      { id: uid(), organizationId: org.id, userId: admin.id, role: "ADMIN", createdAt: now(), updatedAt: now() },
      { id: uid(), organizationId: org.id, userId: dev.id, role: "DEVELOPER", createdAt: now(), updatedAt: now() },
      { id: uid(), organizationId: org.id, userId: viewer.id, role: "VIEWER", createdAt: now(), updatedAt: now() },
    );

    const project: Project = { id: uid(), organizationId: org.id, name: "Core Platform", description: "Primary production workloads", createdAt: now(), updatedAt: now() };
    this.projects.push(project);

    const fixedPolicy: RetryPolicy = { id: uid(), name: "Fixed · 5s", strategy: "FIXED", baseDelayMs: 5000, maxDelayMs: 5000, maxAttempts: 3, createdAt: now(), updatedAt: now() };
    const linearPolicy: RetryPolicy = { id: uid(), name: "Linear · 3s step", strategy: "LINEAR", baseDelayMs: 3000, maxDelayMs: 30000, maxAttempts: 4, createdAt: now(), updatedAt: now() };
    const expPolicy: RetryPolicy = { id: uid(), name: "Exponential · 2s base", strategy: "EXPONENTIAL", baseDelayMs: 2000, maxDelayMs: 60000, maxAttempts: 5, createdAt: now(), updatedAt: now() };
    this.retryPolicies.push(fixedPolicy, linearPolicy, expPolicy);

    const q1: Queue = { id: uid(), projectId: project.id, name: "emails", description: "Transactional email delivery", priority: 8, concurrencyLimit: 3, isPaused: false, retryPolicyId: expPolicy.id, createdAt: now(), updatedAt: now() };
    const q2: Queue = { id: uid(), projectId: project.id, name: "reports", description: "Async report generation", priority: 5, concurrencyLimit: 2, isPaused: false, retryPolicyId: linearPolicy.id, createdAt: now(), updatedAt: now() };
    const q3: Queue = { id: uid(), projectId: project.id, name: "webhooks", description: "Outbound webhook delivery", priority: 6, concurrencyLimit: 4, isPaused: false, retryPolicyId: fixedPolicy.id, createdAt: now(), updatedAt: now() };
    this.queues.push(q1, q2, q3);

    for (let i = 0; i < 5; i++) this.registerWorker(`worker-${i + 1}`, i === 0 ? 3 : 2);

    // Seed a recurring job
    this.createJob({ queueId: q2.id, name: "nightly-report", type: "RECURRING", payload: { durationMs: 2500 }, cronExpression: "*/45 * * * * *" });

    // Seed a handful of immediate/delayed jobs for an instantly populated dashboard
    for (let i = 0; i < 6; i++) {
      this.createJob({ queueId: q1.id, name: `welcome-email-${i + 1}`, type: "IMMEDIATE", payload: { durationMs: rand(1200, 3200), to: `user${i}@example.com` } });
    }
    for (let i = 0; i < 3; i++) {
      this.createJob({ queueId: q3.id, name: `webhook-delivery-${i + 1}`, type: "DELAYED", payload: { durationMs: rand(1000, 2000), url: "https://example.com/hook" }, runAt: new Date(Date.now() + rand(3000, 12000)).toISOString() });
    }
    this.createJob({ queueId: q1.id, name: "flaky-notification", type: "IMMEDIATE", payload: { durationMs: 1500, forceFail: true } });
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function rand(min: number, max: number) { return Math.round(min + Math.random() * (max - min)); }
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function pickError() {
  const errors = [
    "Connection timeout to downstream service",
    "ECONNRESET: socket hang up",
    "Rate limit exceeded (429)",
    "Upstream returned 500 Internal Server Error",
    "Invalid payload schema for handler",
    "DNS resolution failed for target host",
  ];
  return errors[Math.floor(Math.random() * errors.length)];
}
// Very small cron-interval approximation for the demo (supports "every N seconds" form and a few presets).
function cronIntervalMs(expr: string): number {
  const secMatch = expr.match(/^\*\/(\d+) \* \* \* \* \*$/);
  if (secMatch) return Number(secMatch[1]) * 1000;
  if (expr === "* * * * *") return 60_000;
  if (expr === "*/5 * * * *") return 5 * 60_000;
  if (expr === "0 * * * *") return 60 * 60_000;
  return 45_000;
}
function describeCron(expr: string): string {
  const secMatch = expr.match(/^\*\/(\d+) \* \* \* \* \*$/);
  if (secMatch) return `Every ${secMatch[1]} seconds`;
  if (expr === "* * * * *") return "Every minute";
  if (expr === "*/5 * * * *") return "Every 5 minutes";
  if (expr === "0 * * * *") return "Every hour";
  return expr;
}

export const engine = new PulsarEngine();
