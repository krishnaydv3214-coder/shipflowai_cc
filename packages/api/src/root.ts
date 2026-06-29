import { createTRPCRouter, publicProcedure } from "./trpc";
import { workspaceRouter } from "./router/workspace";
import { projectRouter } from "./router/project";
import { featureRouter } from "./router/feature";
import { reviewRouter } from "./router/review";

export const appRouter = createTRPCRouter({
  health: publicProcedure.query(() => {
    return { status: "ok", timestamp: Date.now() };
  }),
  workspace: workspaceRouter,
  project: projectRouter,
  feature: featureRouter,
  review: reviewRouter,
});

export type AppRouter = typeof appRouter;
