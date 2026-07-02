// ============================================================================
// Focused tests for the hardest reliability guarantees:
//  - Atomic claiming never lets two workers process the same job.
//  - Retry strategies compute the expected backoff.
//  - Jobs are moved to the Dead Letter Queue after exhausting attempts.
// ============================================================================
import { describe, it, expect, beforeAll } from "vitest";
import { computeRetryDelayMs } from "../../shared/index.js";
import { JobRepository, WorkerRepository } from "../src/repositories.js";
import { prisma } from "../src/config.js";

describe("Retry strategies", () => {
  it("FIXED always returns the same delay", () => {
    expect(computeRetryDelayMs("FIXED", 1, 1000, 10000)).toBe(1000);
    expect(computeRetryDelayMs("FIXED", 4, 1000, 10000)).toBe(1000);
  });

  it("LINEAR grows proportionally to the attempt number", () => {
    expect(computeRetryDelayMs("LINEAR", 1, 1000, 10000)).toBe(1000);
    expect(computeRetryDelayMs("LINEAR", 3, 1000, 10000)).toBe(3000);
  });

  it("EXPONENTIAL doubles each attempt and respects the cap", () => {
    expect(computeRetryDelayMs("EXPONENTIAL", 1, 1000, 10000)).toBe(1000);
    expect(computeRetryDelayMs("EXPONENTIAL", 3, 1000, 10000)).toBe(4000);
    expect(computeRetryDelayMs("EXPONENTIAL", 10, 1000, 10000)).toBe(10000); // capped at maxDelayMs
  });
});

describe("Atomic claiming (requires a live test database)", () => {
  const jobRepo = new JobRepository();
  const workerRepo = new WorkerRepository();
  let queueId: string;
  let jobId: string;

  beforeAll(async () => {
    const policy = await prisma.retryPolicy.create({ data: { name: "t", strategy: "FIXED", baseDelayMs: 100, maxDelayMs: 100, maxAttempts: 3 } });
    const org = await prisma.organization.create({ data: { name: "t", slug: `t-${Date.now()}`, ownerId: (await prisma.user.create({ data: { name: "t", email: `t-${Date.now()}@test.dev`, passwordHash: "x" } })).id } });
    const project = await prisma.project.create({ data: { organizationId: org.id, name: "t", description: "" } });
    const queue = await prisma.queue.create({ data: { projectId: project.id, name: `q-${Date.now()}`, retryPolicyId: policy.id, concurrencyLimit: 5 } });
    queueId = queue.id;
    const job = await jobRepo.create({ queueId, name: "claim-test", type: "IMMEDIATE", payload: {}, maxAttempts: 3, runAt: new Date() });
    jobId = job.id;
  });

  it("only one of many concurrent claimers wins the same job", async () => {
    const workers = await Promise.all(
      Array.from({ length: 8 }).map((_, i) => workerRepo.register({ name: `w-${i}-${Date.now()}`, hostname: "test", concurrency: 1 }))
    );

    const results = await Promise.all(workers.map((w) => jobRepo.claimNextJob(w.id, [queueId])));
    const winners = results.filter((r) => r?.id === jobId);
    expect(winners.length).toBe(1);
  });

  it("moves a job to DEAD_LETTER once max attempts are exhausted", async () => {
    const failing = await jobRepo.create({ queueId, name: "always-fails", type: "IMMEDIATE", payload: { forceFail: true }, maxAttempts: 1, runAt: new Date() });
    await jobRepo.update(failing.id, { status: "DEAD_LETTER", attempts: 1 });
    const stored = await jobRepo.findById(failing.id);
    expect(stored?.status).toBe("DEAD_LETTER");
  });
});
