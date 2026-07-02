// ============================================================================
// Route definitions — maps REST endpoints (see docs/API.md & openapi.yaml)
// to controllers, wired through auth/RBAC/validation middleware.
// ============================================================================
import { Router } from "express";
import {
  AuthController, OrganizationController, ProjectController, QueueController,
  JobController, WorkerController, LogController, DeadLetterController,
  MetricsController, RetryPolicyController,
} from "./controllers.js";
import { asyncHandler, requireAuth, requireRole, validate } from "./middleware.js";
import {
  registerSchema, loginSchema, refreshSchema, createOrganizationSchema, inviteMemberSchema,
  createProjectSchema, createQueueSchema, updateQueueSchema, createJobSchema, createRetryPolicySchema,
} from "./validators.js";

const router = Router();

// --------------------------------------------------------------- AUTH ------
router.post("/auth/register", validate(registerSchema), asyncHandler(AuthController.register));
router.post("/auth/login", validate(loginSchema), asyncHandler(AuthController.login));
router.post("/auth/refresh", validate(refreshSchema), asyncHandler(AuthController.refresh));
router.get("/auth/me", requireAuth, asyncHandler(AuthController.me));

// -------------------------------------------------------- ORGANIZATIONS ----
router.post("/organizations", requireAuth, validate(createOrganizationSchema), asyncHandler(OrganizationController.create));
router.get("/organizations", requireAuth, asyncHandler(OrganizationController.list));
router.post("/organizations/:organizationId/invite", requireAuth, requireRole("ADMIN"), validate(inviteMemberSchema), asyncHandler(OrganizationController.invite));
router.get("/organizations/:organizationId/members", requireAuth, asyncHandler(OrganizationController.members));

// -------------------------------------------------------------- PROJECTS ---
router.post("/projects", requireAuth, requireRole("ADMIN", "DEVELOPER"), validate(createProjectSchema), asyncHandler(ProjectController.create));
router.get("/projects", requireAuth, asyncHandler(ProjectController.list));

// ---------------------------------------------------------- RETRY POLICIES -
router.post("/retry-policies", requireAuth, requireRole("ADMIN", "DEVELOPER"), validate(createRetryPolicySchema), asyncHandler(RetryPolicyController.create));
router.get("/retry-policies", requireAuth, asyncHandler(RetryPolicyController.list));

// ---------------------------------------------------------------- QUEUES ---
router.post("/queues", requireAuth, requireRole("ADMIN", "DEVELOPER"), validate(createQueueSchema), asyncHandler(QueueController.create));
router.get("/queues", requireAuth, asyncHandler(QueueController.list));
router.put("/queues/:id", requireAuth, requireRole("ADMIN", "DEVELOPER"), validate(updateQueueSchema), asyncHandler(QueueController.update));
router.post("/queues/:id/pause", requireAuth, requireRole("ADMIN", "DEVELOPER"), asyncHandler(QueueController.pause));
router.post("/queues/:id/resume", requireAuth, requireRole("ADMIN", "DEVELOPER"), asyncHandler(QueueController.resume));

// ------------------------------------------------------------------ JOBS ---
router.post("/jobs", requireAuth, requireRole("ADMIN", "DEVELOPER"), validate(createJobSchema), asyncHandler(JobController.create));
router.get("/jobs", requireAuth, asyncHandler(JobController.list));
router.get("/jobs/:id", requireAuth, asyncHandler(JobController.get));
router.delete("/jobs/:id", requireAuth, requireRole("ADMIN", "DEVELOPER"), asyncHandler(JobController.delete));
router.post("/jobs/:id/retry", requireAuth, requireRole("ADMIN", "DEVELOPER"), asyncHandler(JobController.retry));

// --------------------------------------------------------------- WORKERS ---
router.get("/workers", requireAuth, asyncHandler(WorkerController.list));
router.post("/workers", asyncHandler(WorkerController.register)); // called by worker processes on boot (service-to-service)
router.post("/workers/:id/heartbeat", asyncHandler(WorkerController.heartbeat)); // service-to-service

// ------------------------------------------------------------------ LOGS ---
router.get("/logs", requireAuth, asyncHandler(LogController.list));

// ------------------------------------------------------------------- DLQ ---
router.get("/dead-letter-queue", requireAuth, asyncHandler(DeadLetterController.list));

// --------------------------------------------------------------- METRICS ---
router.get("/metrics", requireAuth, asyncHandler(MetricsController.summary));

export default router;
