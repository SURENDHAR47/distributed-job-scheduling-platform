// ============================================================================
// Integration tests (Vitest + Supertest) against a disposable test database.
// Run with: npm test (expects DATABASE_URL to point at a throwaway Postgres,
// see docker/docker-compose.yml `db-test` service).
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/config.js";

const app = createApp();
const rand = () => Math.random().toString(36).slice(2, 8);

describe("Auth", () => {
  const email = `user-${rand()}@test.dev`;

  it("registers a new user and returns tokens", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({ name: "Test User", email, password: "password123" });
    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.email).toBe(email);
  });

  it("rejects duplicate registration", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({ name: "Test User", email, password: "password123" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("logs in with correct credentials", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email, password: "password123" });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it("rejects invalid credentials", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email, password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("rejects malformed payloads with a validation error", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });
});

describe("Queues & Jobs", () => {
  let token: string;
  let organizationId: string;
  let projectId: string;
  let retryPolicyId: string;
  let queueId: string;

  beforeAll(async () => {
    const email = `owner-${rand()}@test.dev`;
    const register = await request(app).post("/api/v1/auth/register").send({ name: "Owner", email, password: "password123" });
    token = register.body.data.accessToken;

    const org = await request(app).post("/api/v1/organizations").set("Authorization", `Bearer ${token}`).send({ name: "TestOrg" });
    organizationId = org.body.data.id;

    const project = await request(app).post("/api/v1/projects").set("Authorization", `Bearer ${token}`).send({ organizationId, name: "TestProject" });
    projectId = project.body.data.id;

    const policy = await request(app).post("/api/v1/retry-policies").set("Authorization", `Bearer ${token}`).send({ name: "Fixed", strategy: "FIXED", baseDelayMs: 100, maxDelayMs: 100, maxAttempts: 3 });
    retryPolicyId = policy.body.data.id;
  });

  it("creates a queue", async () => {
    const res = await request(app).post("/api/v1/queues").set("Authorization", `Bearer ${token}`).send({ projectId, name: "test-queue", priority: 5, concurrencyLimit: 2, retryPolicyId });
    expect(res.status).toBe(201);
    queueId = res.body.data.id;
  });

  it("rejects unauthenticated queue creation", async () => {
    const res = await request(app).post("/api/v1/queues").send({ projectId, name: "nope", retryPolicyId });
    expect(res.status).toBe(401);
  });

  it("pauses and resumes a queue", async () => {
    const paused = await request(app).post(`/api/v1/queues/${queueId}/pause`).set("Authorization", `Bearer ${token}`);
    expect(paused.body.data.isPaused).toBe(true);
    const resumed = await request(app).post(`/api/v1/queues/${queueId}/resume`).set("Authorization", `Bearer ${token}`);
    expect(resumed.body.data.isPaused).toBe(false);
  });

  it("creates an immediate job and lists it with pagination", async () => {
    const create = await request(app).post("/api/v1/jobs").set("Authorization", `Bearer ${token}`).send({ queueId, name: "send-email", type: "IMMEDIATE", payload: {} });
    expect(create.status).toBe(201);

    const list = await request(app).get(`/api/v1/jobs?queueId=${queueId}&page=1&pageSize=10`).set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it("validates delayed jobs require runAt", async () => {
    const res = await request(app).post("/api/v1/jobs").set("Authorization", `Bearer ${token}`).send({ queueId, name: "delayed", type: "DELAYED", payload: {} });
    expect(res.status).toBe(400);
  });

  afterAll(async () => { await prisma.$disconnect(); });
});
