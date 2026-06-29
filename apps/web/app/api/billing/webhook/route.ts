import { prisma } from "@repo/db";
import { billing } from "@repo/billing";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (secret) {
    if (!billing.verifyWebhookSignature(body, signature, secret)) {
      return new Response("Invalid signature", { status: 401 });
    }
  } else {
    console.warn("RAZORPAY_WEBHOOK_SECRET is not configured. Skipping webhook signature verification.");
  }

  try {
    const event = JSON.parse(body);
    const eventName = event.event;

    if (
      eventName === "subscription.activated" ||
      eventName === "subscription.charged" ||
      eventName === "subscription.cancelled"
    ) {
      const subscriptionPayload = event.payload?.subscription?.entity;
      if (!subscriptionPayload) {
        return new Response("Missing subscription payload", { status: 400 });
      }

      const subscriptionId = subscriptionPayload.id;
      const statusRaw = subscriptionPayload.status;
      const currentStartEpoch = subscriptionPayload.current_start;
      const currentEndEpoch = subscriptionPayload.current_end;

      // Extract notes metadata
      const notes = subscriptionPayload.notes || {};
      const workspaceId = notes.workspaceId as string;
      const plan = (notes.plan || "PRO") as "PRO" | "ENTERPRISE";

      if (!workspaceId) {
        console.warn(`Webhook subscription ${subscriptionId} has no workspaceId in notes. Skipping database sync.`);
        return new Response("Workspace metadata missing", { status: 200 });
      }

      const currentPeriodStart = currentStartEpoch ? new Date(currentStartEpoch * 1000) : new Date();
      const currentPeriodEnd = currentEndEpoch ? new Date(currentEndEpoch * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      let status = "ACTIVE";
      if (statusRaw === "cancelled" || statusRaw === "halted") {
        status = "CANCELLED";
      } else if (statusRaw === "past_due") {
        status = "PAST_DUE";
      }

      await prisma.$transaction(async (tx) => {
        // 1. Update Subscription record
        await tx.subscription.upsert({
          where: { workspaceId },
          update: {
            razorpaySubscriptionId: subscriptionId,
            plan,
            status,
            currentPeriodStart,
            currentPeriodEnd,
          },
          create: {
            workspaceId,
            razorpaySubscriptionId: subscriptionId,
            plan,
            status,
            currentPeriodStart,
            currentPeriodEnd,
          },
        });

        // 2. Grant credits on activation or charged events
        if (eventName === "subscription.activated" || eventName === "subscription.charged") {
          const balanceIncrement = plan === "PRO" ? 1000 : 10000;

          await tx.aiCredit.upsert({
            where: { workspaceId },
            update: {
              balance: { increment: balanceIncrement },
              lifetimeAllocated: { increment: balanceIncrement },
            },
            create: {
              workspaceId,
              balance: balanceIncrement + 50, // default + new tier allocation
              lifetimeAllocated: balanceIncrement + 50,
            },
          });

          await tx.aiCreditLog.create({
            data: {
              workspaceId,
              amount: balanceIncrement,
              feature: "SUBSCRIPTION_REFRESH",
              metadata: { subscriptionId, plan, event: eventName },
            },
          });
        }
      });
    }

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error("Error processing Razorpay webhook:", error);
    return new Response(`Error: ${error.message || error}`, { status: 500 });
  }
}
