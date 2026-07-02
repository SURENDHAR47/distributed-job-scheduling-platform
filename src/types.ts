// ============================================================================
// Domain types — mirror the normalized PostgreSQL schema (see /database/schema.prisma)
// ============================================================================

export type Role = "ADMIN" | "DEVELOPER" | "VIEWER";

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export type RetryStrategy = "FIXED" | "LINEAR" | "EXPONENTIAL";

export interface RetryPolicy {
  id: string;
  name: string;
  strategy: RetryStrategy;
  baseDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface Queue {
  id: string;
  projectId: string;
  name: string;
  description: string;
  priority: number; // 1 (low) - 10 (high)
  concurrencyLimit: number;
  isPaused: boolean;
  retryPolicyId: string;
  createdAt: string;
  updatedAt: string;
}

export type JobType = "IMMEDIATE" | "DELAYED" | "SCHEDULED" | "RECURRING" | "BATCH";

export type JobStatus =
  | "QUEUED"
  | "SCHEDULED"
  | "CLAIMED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "RETRYING"
  | "DEAD_LETTER"
  | "CANCELLED";

export interface Job {
  id: string;
  queueId: string;
  batchId: string | null;
  recurringJobId: string | null;
  name: string;
  type: JobType;
  status: JobStatus;
  payload: Record<string, unknown>;
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAt: string; // when the job becomes eligible to run
  claimedBy: string | null; // workerId
  claimedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledJob {
  id: string;
  jobId: string;
  scheduledFor: string;
  executed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringJob {
  id: string;
  queueId: string;
  name: string;
  cronExpression: string;
  cronHuman: string;
  payloadTemplate: Record<string, unknown>;
  isActive: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BatchJob {
  id: string;
  queueId: string;
  name: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "PARTIAL_FAILURE";
  createdAt: string;
  updatedAt: string;
}

export type ExecutionStatus = "RUNNING" | "COMPLETED" | "FAILED";

export interface JobExecution {
  id: string;
  jobId: string;
  workerId: string;
  attemptNumber: number;
  status: ExecutionStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  errorStack: string | null;
  createdAt: string;
  updatedAt: string;
}

export type WorkerStatus = "ONLINE" | "BUSY" | "OFFLINE";

export interface Worker {
  id: string;
  name: string;
  hostname: string;
  status: WorkerStatus;
  concurrency: number;
  activeJobIds: string[];
  lastHeartbeatAt: string;
  cpuUsage: number;
  memoryUsage: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerHeartbeat {
  id: string;
  workerId: string;
  cpuUsage: number;
  memoryUsage: number;
  activeJobs: number;
  timestamp: string;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface ExecutionLog {
  id: string;
  jobExecutionId: string;
  jobId: string;
  level: LogLevel;
  message: string;
  timestamp: string;
}

export interface DeadLetterEntry {
  id: string;
  jobId: string;
  queueId: string;
  reason: string;
  attemptsMade: number;
  payloadSnapshot: Record<string, unknown>;
  failedAt: string;
  createdAt: string;
}

export interface QueueStats {
  queueId: string;
  queued: number;
  scheduled: number;
  running: number;
  completed: number;
  failed: number;
  deadLetter: number;
  throughputPerMin: number;
  successRate: number;
  retryRate: number;
  avgDurationMs: number;
}

export interface GlobalMetrics {
  totalJobs: number;
  runningJobs: number;
  failedJobs: number;
  completedJobs: number;
  deadLetterJobs: number;
  activeWorkers: number;
  totalWorkers: number;
  avgExecutionTimeMs: number;
  throughputPerMin: number;
  successRate: number;
  retryRate: number;
  workerUtilization: number;
  cpuUsage: number;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AuthSession {
  token: string;
  refreshToken: string;
  user: User;
}
