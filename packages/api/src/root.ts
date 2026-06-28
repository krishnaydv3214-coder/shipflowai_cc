import { createTRPCRouter, publicProcedure } from "./trpc";
import { workspaceRouter } from "./router/workspace";
import { projectRouter } from "./router/project";

export const appRouter = createTRPCRouter({
  health: publicProcedure.query(() => {
    return { status: "ok", timestamp: Date.now() };
  }),
  workspace: workspaceRouter,
  project: projectRouter,
});

export type AppRouter = typeof appRouter;
