import Razorpay from "razorpay";
import crypto from "crypto";

export interface SubscriptionSessionPayload {
  subscriptionId: string;
  keyId: string;
  shortUrl?: string;
  isSimulated: boolean;
}

// Helper to check if credentials are set
export function hasRazorpayCredentials(): boolean {
  return !!(
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET
  );
}

// Helper to get authenticated Razorpay client instance
export function getRazorpayClient(): Razorpay | null {
  if (!hasRazorpayCredentials()) {
    console.warn("Razorpay credentials missing. Razorpay client is running in mock fallback mode.");
    return null;
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });
}

// Core billing services
export const billing = {
  /**
   * Creates a subscription session on Razorpay
   */
  createSubscriptionSession: async (
    plan: "PRO" | "ENTERPRISE",
    workspaceId: string
  ): Promise<SubscriptionSessionPayload> => {
    const isSimulated = !hasRazorpayCredentials();

    if (isSimulated) {
      const mockSubId = `sub_mock_${Math.random().toString(36).substring(2, 11)}`;
      return {
        subscriptionId: mockSubId,
        keyId: "rzp_test_dummykey",
        shortUrl: `/api/billing/mock-success?sub_id=${mockSubId}&workspace_id=${workspaceId}&plan=${plan}`,
        isSimulated: true,
      };
    }

    const client = getRazorpayClient()!;
    // Lookup plan ID from environment or fall back to dummy ID
    const planId =
      plan === "PRO"
        ? process.env.RAZORPAY_PLAN_PRO_ID || "plan_pro_default"
        : process.env.RAZORPAY_PLAN_ENTERPRISE_ID || "plan_ent_default";

    try {
      const subscription = await client.subscriptions.create({
        plan_id: planId,
        total_count: 120, // 10 years
        quantity: 1,
        notes: {
          workspaceId,
          plan,
        },
      });

      return {
        subscriptionId: subscription.id,
        keyId: process.env.RAZORPAY_KEY_ID!,
        shortUrl: subscription.short_url,
        isSimulated: false,
      };
    } catch (error: any) {
      console.error("Razorpay subscription creation failed:", error);
      throw new Error(`Razorpay API Error: ${error.description || error.message || error}`);
    }
  },

  /**
   * Cryptographically validates the webhook signature from Razorpay
   */
  verifyWebhookSignature: (body: string, signature: string | null, secret: string): boolean => {
    if (!signature) return false;
    try {
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(body)
        .digest("hex");
      return expectedSignature === signature;
    } catch {
      return false;
    }
  },
};
