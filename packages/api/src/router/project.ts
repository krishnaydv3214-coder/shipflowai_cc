import { z } from "zod";
import { createTRPCRouter, workspaceProcedure, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

export const projectRouter = createTRPCRouter({
  create: workspaceProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.project.create({
        data: {
          workspaceId: ctx.workspace.id,
          name: input.name,
          description: input.description,
        },
      });
    }),

  list: workspaceProcedure
    .query(async ({ ctx }) => {
      return ctx.prisma.project.findMany({
        where: { workspaceId: ctx.workspace.id },
        orderBy: { createdAt: "desc" },
      });
    }),

  get: workspaceProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({
        where: {
          id: input.projectId,
          workspaceId: ctx.workspace.id,
        },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found in this workspace.",
        });
      }

      return project;
    }),

  connectGithub: adminProcedure
    .input(
      z.object({
        projectId: z.string(),
        repository: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({
        where: {
          id: input.projectId,
          workspaceId: ctx.workspace.id,
        },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found.",
        });
      }

      return ctx.prisma.project.update({
        where: { id: input.projectId },
        data: {
          githubRepository: input.repository,
        },
      });
    }),
});
