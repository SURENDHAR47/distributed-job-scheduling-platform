// ============================================================================
// Shared types & constants used by server/, worker/ and client/.
// Publishing this as a workspace package keeps the contract between the API,
// the worker fleet and the dashboard perfectly in sync.
// ============================================================================

export type Role = "ADMIN" | "DEVELOPER" | "VIEWER";

export type JobType = "IMMEDIATE" | "DELAYED" | "SCHEDULED" | "RECURRING" | "BATCH";

export type JobStatus =
  | "QUEUED" | "SCHEDULED" | "CLAIMED" | "RUNNING"
  | "COMPLETED" | "FAILED" | "RETRYING" | "DEAD_LETTER" | "CANCELLED";

export type RetryStrategy = "FIXED" | "LINEAR" | "EXPONENTIAL";

export type WorkerStatus = "ONLINE" | "BUSY" | "OFFLINE";

export const SOCKET_EVENTS = {
  JOB_CREATED: "job:created",
  JOB_UPDATED: "job:updated",
  JOB_COMPLETED: "job:completed",
  JOB_FAILED: "job:failed",
  JOB_DEAD_LETTER: "job:dead_letter",
  QUEUE_PAUSED: "queue:paused",
  QUEUE_RESUMED: "queue:resumed",
  QUEUE_UPDATED: "queue:updated",
  WORKER_ONLINE: "worker:online",
  WORKER_OFFLINE: "worker:offline",
  WORKER_HEARTBEAT: "worker:heartbeat",
  LOG_NEW: "log:new",
} as const;

/** Pure function used by both the worker and the server's manual-retry endpoint. */
export function computeRetryDelayMs(strategy: RetryStrategy, attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  let delay: number;
  switch (strategy) {
    case "FIXED": delay = baseDelayMs; break;
    case "LINEAR": delay = baseDelayMs * attempt; break;
    case "EXPONENTIAL": default: delay = baseDelayMs * Math.pow(2, attempt - 1); break;
  }
  return Math.min(delay, maxDelayMs);
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
