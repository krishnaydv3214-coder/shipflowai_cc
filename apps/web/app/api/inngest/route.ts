import { serve } from "inngest/next";
import { inngest, functions } from "@repo/inngest";

// Expose Next.js app router route handler
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
