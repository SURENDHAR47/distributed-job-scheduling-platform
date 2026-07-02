// ============================================================================
// Zod request-validation schemas, grouped by resource.
// ============================================================================
import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(6).max(72),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(10) });

export const createOrganizationSchema = z.object({ name: z.string().min(2).max(80) });

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "DEVELOPER", "VIEWER"]),
});

export const createProjectSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional().default(""),
});

export const createRetryPolicySchema = z.object({
  name: z.string().min(2).max(80),
  strategy: z.enum(["FIXED", "LINEAR", "EXPONENTIAL"]),
  baseDelayMs: z.number().int().min(0),
  maxDelayMs: z.number().int().min(0),
  maxAttempts: z.number().int().min(1).max(20),
});

export const createQueueSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional().default(""),
  priority: z.number().int().min(1).max(10).default(5),
  concurrencyLimit: z.number().int().min(1).max(100).default(2),
  retryPolicyId: z.string().uuid(),
});

export const updateQueueSchema = createQueueSchema.partial().omit({ projectId: true });

export const createJobSchema = z.object({
  queueId: z.string().uuid(),
  name: z.string().min(1).max(150),
  type: z.enum(["IMMEDIATE", "DELAYED", "SCHEDULED", "RECURRING", "BATCH"]),
  payload: z.record(z.unknown()).default({}),
  priority: z.number().int().min(1).max(10).optional(),
  maxAttempts: z.number().int().min(1).max(20).optional(),
  runAt: z.string().datetime().optional(),
  cronExpression: z.string().optional(),
  batchSize: z.number().int().min(1).max(1000).optional(),
}).superRefine((data, ctx) => {
  if ((data.type === "DELAYED" || data.type === "SCHEDULED") && !data.runAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "runAt is required for DELAYED/SCHEDULED jobs", path: ["runAt"] });
  }
  if (data.type === "RECURRING" && !data.cronExpression) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "cronExpression is required for RECURRING jobs", path: ["cronExpression"] });
  }
});

export const listJobsQuerySchema = z.object({
  queueId: z.string().uuid().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

export const uuidParamSchema = z.object({ id: z.string().uuid() });
