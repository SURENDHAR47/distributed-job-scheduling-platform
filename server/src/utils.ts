// ============================================================================
// Cross-cutting utilities: password hashing, JWT signing/verification and a
// consistent API response envelope.
// ============================================================================
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Response } from "express";
import { env } from "./config.js";

const SALT_ROUNDS = 10;

export const hashPassword = (plain: string) => bcrypt.hash(plain, SALT_ROUNDS);
export const comparePassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export interface AccessTokenPayload { sub: string; email: string; }

export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: env.jwtAccessTtl });
}
export function signRefreshToken(payload: { sub: string }) {
  return jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshTtl });
}
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
}
export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, env.jwtRefreshSecret) as { sub: string };
}

/** Custom application error carrying an HTTP status + machine-readable code. */
export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  static badRequest(msg: string, details?: unknown) { return new ApiError(400, "BAD_REQUEST", msg, details); }
  static unauthorized(msg = "Unauthorized") { return new ApiError(401, "UNAUTHORIZED", msg); }
  static forbidden(msg = "Forbidden") { return new ApiError(403, "FORBIDDEN", msg); }
  static notFound(msg = "Not found") { return new ApiError(404, "NOT_FOUND", msg); }
  static conflict(msg: string) { return new ApiError(409, "CONFLICT", msg); }
}

export function sendSuccess(res: Response, data: unknown, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function sendPaginated<T>(res: Response, data: T[], page: number, pageSize: number, total: number) {
  return res.status(200).json({
    success: true,
    data,
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}

/** Parses & clamps pagination/sort query params consistently across list endpoints. */
export function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  const sortBy = typeof query.sortBy === "string" ? query.sortBy : "createdAt";
  const sortDir = query.sortDir === "asc" ? "asc" : "desc";
  return { page, pageSize, sortBy, sortDir: sortDir as "asc" | "desc", skip: (page - 1) * pageSize, take: pageSize };
}
