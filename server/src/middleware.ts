// ============================================================================
// Express middleware: JWT auth, RBAC guard, Zod validation, and centralized
// error handling with a structured error-response envelope.
// ============================================================================
import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { ZodError } from "zod";
import { ApiError, verifyAccessToken } from "./utils.js";
import { prisma } from "./config.js";
import { logger } from "./config.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; email: string };
      membershipRole?: string;
    }
  }
}

/** Verifies the Bearer JWT and attaches `req.user`. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw ApiError.unauthorized("Missing bearer token");
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    throw ApiError.unauthorized("Invalid or expired token");
  }
}

/**
 * RBAC guard — resolves the caller's role within the organization referenced
 * by `organizationId` (route param, query, or body) and rejects unless it is
 * one of `roles`. ADMIN > DEVELOPER > VIEWER.
 */
export function requireRole(...roles: Array<"ADMIN" | "DEVELOPER" | "VIEWER">) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw ApiError.unauthorized();
    const organizationId = (req.params.organizationId || req.body?.organizationId || req.query?.organizationId) as string | undefined;
    if (!organizationId) return next(); // resource-level checks happen in the service layer
    const membership = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: req.user.id } },
    });
    if (!membership || !roles.includes(membership.role as any)) {
      throw ApiError.forbidden("Insufficient role for this operation");
    }
    req.membershipRole = membership.role;
    next();
  };
}

/** Validates `req.body` (or `req.query`) against a Zod schema. */
export function validate(schema: ZodSchema, source: "body" | "query" | "params" = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      throw ApiError.badRequest("Validation failed", result.error.flatten());
    }
    req[source] = result.data as any;
    next();
  };
}

/** Wraps async route handlers so rejected promises reach the error middleware. */
export function asyncHandler<T extends (...args: any[]) => Promise<any>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    if (err.status >= 500) logger.error(err.message, { stack: err.stack });
    return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Validation failed", details: err.flatten() } });
  }
  logger.error("Unhandled error", { err });
  return res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
}
