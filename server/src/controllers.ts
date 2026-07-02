// ============================================================================
// Controllers — thin HTTP adapters that validate inputs (via middleware),
// call the service layer, and shape the response envelope.
// ============================================================================
import type { Request, Response } from "express";
import {
  AuthService, OrganizationService, ProjectService, QueueService, JobService,
  WorkerService, LogService, DeadLetterService, MetricsService, RetryPolicyService,
} from "./services.js";
import { ApiError, parsePagination, sendPaginated, sendSuccess } from "./utils.js";

export const AuthController = {
  register: async (req: Request, res: Response) => {
    const { name, email, password } = req.body;
    const result = await AuthService.register(name, email, password);
    sendSuccess(res, result, 201);
  },
  login: async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const result = await AuthService.login(email, password);
    sendSuccess(res, result);
  },
  refresh: async (req: Request, res: Response) => {
    const result = await AuthService.refresh(req.body.refreshToken);
    sendSuccess(res, result);
  },
  me: async (req: Request, res: Response) => sendSuccess(res, req.user),
};

export const OrganizationController = {
  create: async (req: Request, res: Response) => sendSuccess(res, await OrganizationService.create(req.user!.id, req.body.name), 201),
  list: async (req: Request, res: Response) => sendSuccess(res, await OrganizationService.list(req.user!.id)),
  invite: async (req: Request, res: Response) => sendSuccess(res, await OrganizationService.invite(req.params.organizationId, req.body.email, req.body.role), 201),
  members: async (req: Request, res: Response) => sendSuccess(res, await OrganizationService.members(req.params.organizationId)),
};

export const ProjectController = {
  create: async (req: Request, res: Response) => sendSuccess(res, await ProjectService.create(req.body.organizationId, req.body.name, req.body.description ?? ""), 201),
  list: async (req: Request, res: Response) => sendSuccess(res, await ProjectService.list(req.query.organizationId as string)),
};

export const RetryPolicyController = {
  create: async (req: Request, res: Response) => sendSuccess(res, await RetryPolicyService.create(req.body), 201),
  list: async (_req: Request, res: Response) => sendSuccess(res, await RetryPolicyService.list()),
};

export const QueueController = {
  create: async (req: Request, res: Response) => sendSuccess(res, await QueueService.create(req.body), 201),
  list: async (req: Request, res: Response) => sendSuccess(res, await QueueService.list(req.query.projectId as string | undefined)),
  update: async (req: Request, res: Response) => sendSuccess(res, await QueueService.update(req.params.id, req.body)),
  pause: async (req: Request, res: Response) => sendSuccess(res, await QueueService.pause(req.params.id)),
  resume: async (req: Request, res: Response) => sendSuccess(res, await QueueService.resume(req.params.id)),
};

export const JobController = {
  create: async (req: Request, res: Response) => sendSuccess(res, await JobService.create(req.body), 201),
  list: async (req: Request, res: Response) => {
    const { skip, take, sortBy, sortDir, page, pageSize } = parsePagination(req.query as any);
    const { queueId, status, type, search } = req.query as Record<string, string | undefined>;
    const { data, total } = await JobService.list({ queueId, status, type, search, skip, take, sortBy, sortDir });
    sendPaginated(res, data, page, pageSize, total);
  },
  get: async (req: Request, res: Response) => {
    const job = await JobService.get(req.params.id);
    if (!job) throw ApiError.notFound("Job not found");
    const executions = await JobService.executions(job.id);
    sendSuccess(res, { ...job, executions });
  },
  delete: async (req: Request, res: Response) => { await JobService.delete(req.params.id); res.status(204).end(); },
  retry: async (req: Request, res: Response) => sendSuccess(res, await JobService.retry(req.params.id)),
};

export const WorkerController = {
  list: async (_req: Request, res: Response) => sendSuccess(res, await WorkerService.list()),
  register: async (req: Request, res: Response) => sendSuccess(res, await WorkerService.register(req.body), 201),
  heartbeat: async (req: Request, res: Response) => {
    const { cpuUsage, memoryUsage, activeJobs } = req.body;
    await WorkerService.heartbeat(req.params.id, cpuUsage, memoryUsage, activeJobs);
    sendSuccess(res, { ok: true });
  },
};

export const LogController = {
  list: async (req: Request, res: Response) => {
    const { skip, take, page, pageSize } = parsePagination(req.query as any);
    const data = await LogService.list({ level: req.query.level as string | undefined, skip, take });
    sendPaginated(res, data, page, pageSize, data.length);
  },
};

export const DeadLetterController = {
  list: async (req: Request, res: Response) => sendSuccess(res, await DeadLetterService.list(req.query.queueId as string | undefined)),
};

export const MetricsController = {
  summary: async (_req: Request, res: Response) => sendSuccess(res, await MetricsService.summary()),
};
