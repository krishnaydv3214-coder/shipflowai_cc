import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // 1. Create a test user
  const user = await prisma.user.upsert({
    where: { email: "test-user@shipflow.ai" },
    update: {},
    create: {
      email: "test-user@shipflow.ai",
      name: "Test User",
      emailVerified: new Date(),
    },
  });
  console.log("User created:", user.email);

  // 2. Create a default workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: "shipflow-ai" },
    update: {},
    create: {
      name: "ShipFlow AI Workspace",
      slug: "shipflow-ai",
    },
  });
  console.log("Workspace created:", workspace.slug);

  // 3. Link user to workspace as OWNER
  const membership = await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: "OWNER",
    },
  });
  console.log("Workspace member role assigned:", membership.role);

  // 4. Create initial AI Credit balance
  const credits = await prisma.aiCredit.upsert({
    where: { workspaceId: workspace.id },
    update: {},
    create: {
      workspaceId: workspace.id,
      balance: 100, // 100 credits for testing
      lifetimeAllocated: 100,
    },
  });
  console.log("Credits allocated:", credits.balance);

  // 5. Create a project
  const project = await prisma.project.create({
    data: {
      name: "ShipFlow AI Core",
      description: "Primary repository tracker for ShipFlow AI",
      workspaceId: workspace.id,
      githubRepository: "shipflowai/core",
    },
  });
  console.log("Project created:", project.name);

  console.log("Database seed completed successfully! 🚀");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
