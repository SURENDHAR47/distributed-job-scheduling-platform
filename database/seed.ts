// ============================================================================
// Seed script — populates a fresh Postgres database with demo data.
// Run with: npm run seed  (see server/package.json)
// ============================================================================
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Pulsar database...");

  const passwordHash = await bcrypt.hash("password123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@pulsar.dev" },
    update: {},
    create: { email: "admin@pulsar.dev", name: "Ada Admin", passwordHash },
  });
  const dev = await prisma.user.upsert({
    where: { email: "dev@pulsar.dev" },
    update: {},
    create: { email: "dev@pulsar.dev", name: "Dana Developer", passwordHash },
  });
  const viewer = await prisma.user.upsert({
    where: { email: "viewer@pulsar.dev" },
    update: {},
    create: { email: "viewer@pulsar.dev", name: "Vic Viewer", passwordHash },
  });

  const org = await prisma.organization.upsert({
    where: { slug: "pulsar-labs" },
    update: {},
    create: { name: "Pulsar Labs", slug: "pulsar-labs", ownerId: admin.id },
  });

  await prisma.organizationMember.createMany({
    data: [
      { organizationId: org.id, userId: admin.id, role: Role.ADMIN },
      { organizationId: org.id, userId: dev.id, role: Role.DEVELOPER },
      { organizationId: org.id, userId: viewer.id, role: Role.VIEWER },
    ],
    skipDuplicates: true,
  });

  const project = await prisma.project.create({
    data: { organizationId: org.id, name: "Core Platform", description: "Primary production workloads" },
  });

  const exponential = await prisma.retryPolicy.create({
    data: { name: "Exponential · 2s base", strategy: "EXPONENTIAL", baseDelayMs: 2000, maxDelayMs: 60000, maxAttempts: 5 },
  });
  const fixed = await prisma.retryPolicy.create({
    data: { name: "Fixed · 5s", strategy: "FIXED", baseDelayMs: 5000, maxDelayMs: 5000, maxAttempts: 3 },
  });
  const linear = await prisma.retryPolicy.create({
    data: { name: "Linear · 3s step", strategy: "LINEAR", baseDelayMs: 3000, maxDelayMs: 30000, maxAttempts: 4 },
  });

  const emails = await prisma.queue.create({
    data: { projectId: project.id, name: "emails", description: "Transactional email delivery", priority: 8, concurrencyLimit: 3, retryPolicyId: exponential.id },
  });
  await prisma.queue.create({
    data: { projectId: project.id, name: "reports", description: "Async report generation", priority: 5, concurrencyLimit: 2, retryPolicyId: linear.id },
  });
  await prisma.queue.create({
    data: { projectId: project.id, name: "webhooks", description: "Outbound webhook delivery", priority: 6, concurrencyLimit: 4, retryPolicyId: fixed.id },
  });

  for (let i = 0; i < 5; i++) {
    await prisma.worker.create({
      data: { name: `worker-${i + 1}`, hostname: `worker-${i + 1}.local`, concurrency: i === 0 ? 3 : 2, status: "ONLINE" },
    });
  }

  for (let i = 0; i < 5; i++) {
    await prisma.job.create({
      data: { queueId: emails.id, name: `welcome-email-${i + 1}`, type: "IMMEDIATE", payload: { to: `user${i}@example.com` }, maxAttempts: exponential.maxAttempts },
    });
  }

  console.log("Seed complete. Demo accounts (password: password123):");
  console.log(" - admin@pulsar.dev (ADMIN)\n - dev@pulsar.dev (DEVELOPER)\n - viewer@pulsar.dev (VIEWER)");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
