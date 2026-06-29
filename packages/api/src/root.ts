import { createTRPCRouter, publicProcedure } from "./trpc";
import { workspaceRouter } from "./router/workspace";
import { projectRouter } from "./router/project";
import { featureRouter } from "./router/feature";

export const appRouter = createTRPCRouter({
  health: publicProcedure.query(() => {
    return { status: "ok", timestamp: Date.now() };
  }),
  workspace: workspaceRouter,
  project: projectRouter,
  feature: featureRouter,
});

export type AppRouter = typeof appRouter;
