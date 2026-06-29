import { inngest } from "@repo/inngest";
import crypto from "crypto";

function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  try {
    const hmac = crypto.createHmac("sha256", secret);
    const digest = "sha256=" + hmac.update(body).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const eventName = req.headers.get("x-github-event");
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (secret) {
    if (!verifySignature(body, signature, secret)) {
      return new Response("Unauthorized Signature", { status: 401 });
    }
  } else {
    console.warn("GITHUB_WEBHOOK_SECRET is not configured. Skipping webhook signature verification.");
  }

  try {
    const payload = JSON.parse(body);

    if (eventName === "pull_request") {
      const action = payload.action;
      if (action === "opened" || action === "synchronize") {
        if (!payload.installation?.id || !payload.repository?.full_name || !payload.pull_request?.number || !payload.pull_request?.head?.sha) {
          return new Response("Missing required webhook payload fields", { status: 400 });
        }

        await inngest.send({
          name: "github/pr.opened",
          data: {
            installationId: payload.installation.id.toString(),
            repository: payload.repository.full_name,
            pullNumber: payload.pull_request.number,
            commitSha: payload.pull_request.head.sha,
          },
        });
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error("Error processing GitHub webhook:", error);
    return new Response(`Internal Server Error: ${error.message || error}`, { status: 500 });
  }
}
