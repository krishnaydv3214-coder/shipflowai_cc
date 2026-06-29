import { prisma } from "@repo/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const subscriptionId = searchParams.get("sub_id");
  const workspaceId = searchParams.get("workspace_id");
  const plan = searchParams.get("plan") as "PRO" | "ENTERPRISE" | null;

  if (!subscriptionId || !workspaceId || !plan) {
    return new Response("Missing required payment session fields", { status: 400 });
  }

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return new Response("Workspace not found", { status: 404 });
    }

    const currentPeriodStart = new Date();
    const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 Days

    await prisma.$transaction(async (tx) => {
      // 1. Create/Update subscription details
      await tx.subscription.upsert({
        where: { workspaceId },
        update: {
          razorpaySubscriptionId: subscriptionId,
          plan,
          status: "ACTIVE",
          currentPeriodStart,
          currentPeriodEnd,
        },
        create: {
          workspaceId,
          razorpaySubscriptionId: subscriptionId,
          plan,
          status: "ACTIVE",
          currentPeriodStart,
          currentPeriodEnd,
        },
      });

      // 2. Increment balance according to the plan
      const balanceIncrement = plan === "PRO" ? 1000 : 10000;
      await tx.aiCredit.upsert({
        where: { workspaceId },
        update: {
          balance: { increment: balanceIncrement },
          lifetimeAllocated: { increment: balanceIncrement },
        },
        create: {
          workspaceId,
          balance: balanceIncrement + 50,
          lifetimeAllocated: balanceIncrement + 50,
        },
      });

      // 3. Log ledger log entry
      await tx.aiCreditLog.create({
        data: {
          workspaceId,
          amount: balanceIncrement,
          feature: "SUBSCRIPTION_REFRESH",
          metadata: { subscriptionId, plan, simulated: true },
        },
      });
    });

    // Redirect to the workspace page with success query param
    return Response.redirect(new URL(`/${workspace.slug}?billing_success=true`, req.url));
  } catch (error: any) {
    console.error("Error processing simulated checkout callback:", error);
    return new Response(`Error: ${error.message || error}`, { status: 500 });
  }
}
