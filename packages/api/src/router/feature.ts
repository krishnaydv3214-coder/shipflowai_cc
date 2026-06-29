import { z } from "zod";
import { createTRPCRouter, workspaceProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { inngest } from "@repo/inngest";

export const featureRouter = createTRPCRouter({
  create: workspaceProcedure
    .input(
      z.object({
        projectId: z.string(),
        title: z.string().min(1),
        description: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Confirm project belongs to the workspace
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

      return ctx.prisma.featureRequest.create({
        data: {
          projectId: input.projectId,
          creatorId: ctx.session.user.id,
          title: input.title,
          description: input.description,
          status: "DRAFT",
          discoveryLog: [],
        },
      });
    }),

  list: workspaceProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Confirm project belongs to the workspace
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

      return ctx.prisma.featureRequest.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "desc" },
      });
    }),

  get: workspaceProcedure
    .input(z.object({ featureRequestId: z.string() }))
    .query(async ({ ctx, input }) => {
      const feature = await ctx.prisma.featureRequest.findFirst({
        where: {
          id: input.featureRequestId,
          project: {
            workspaceId: ctx.workspace.id,
          },
        },
        include: {
          prd: true,
          project: true,
        },
      });

      if (!feature) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found.",
        });
      }

      return feature;
    }),

  sendMessage: workspaceProcedure
    .input(
      z.object({
        featureRequestId: z.string(),
        message: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const feature = await ctx.prisma.featureRequest.findFirst({
        where: {
          id: input.featureRequestId,
          project: {
            workspaceId: ctx.workspace.id,
          },
        },
      });

      if (!feature) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found.",
        });
      }

      // Check credit balance before proceeding
      const credit = await ctx.prisma.aiCredit.findUnique({
        where: { workspaceId: ctx.workspace.id },
      });

      if (!credit || credit.balance < 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Insufficient AI credits. Please upgrade or purchase more credits.",
        });
      }

      // Append user message to discoveryLog
      const currentLog = Array.isArray(feature.discoveryLog)
        ? (feature.discoveryLog as any[])
        : [];
      
      const updatedLog = [
        ...currentLog,
        {
          role: "user",
          content: input.message,
          createdAt: new Date().toISOString(),
        },
      ];

      // Update feature request log and set status to DISCOVERY
      const updatedFeature = await ctx.prisma.featureRequest.update({
        where: { id: input.featureRequestId },
        data: {
          status: "DISCOVERY",
          discoveryLog: updatedLog,
        },
      });

      // Dispatch to Inngest to trigger background AI response formulation
      await inngest.send({
        name: "discovery/message.received",
        data: {
          workspaceId: ctx.workspace.id,
          featureRequestId: input.featureRequestId,
        },
      });

      return updatedFeature;
    }),

  triggerPrdGeneration: workspaceProcedure
    .input(z.object({ featureRequestId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const feature = await ctx.prisma.featureRequest.findFirst({
        where: {
          id: input.featureRequestId,
          project: {
            workspaceId: ctx.workspace.id,
          },
        },
      });

      if (!feature) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found.",
        });
      }

      // Check credit balance before starting PRD generation (costs 5 credits)
      const credit = await ctx.prisma.aiCredit.findUnique({
        where: { workspaceId: ctx.workspace.id },
      });

      if (!credit || credit.balance < 5) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Insufficient AI credits to generate a PRD (5 credits required).",
        });
      }

      // Set state to DISCOVERY
      const updatedFeature = await ctx.prisma.featureRequest.update({
        where: { id: input.featureRequestId },
        data: {
          status: "DISCOVERY",
        },
      });

      // Dispatch PRD generation event to Inngest
      await inngest.send({
        name: "prd/generate",
        data: {
          workspaceId: ctx.workspace.id,
          featureRequestId: input.featureRequestId,
        },
      });

      return updatedFeature;
    }),

  triggerTasksGeneration: workspaceProcedure
    .input(z.object({ featureRequestId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const feature = await ctx.prisma.featureRequest.findFirst({
        where: {
          id: input.featureRequestId,
          project: {
            workspaceId: ctx.workspace.id,
          },
        },
        include: {
          prd: true,
        },
      });

      if (!feature) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found.",
        });
      }

      if (!feature.prd) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot generate tasks without a product requirement document (PRD). Please generate the PRD first.",
        });
      }

      // Dispatch to Inngest background event
      await inngest.send({
        name: "tasks/generate",
        data: {
          workspaceId: ctx.workspace.id,
          featureRequestId: input.featureRequestId,
        },
      });

      return feature;
    }),

  getTasks: workspaceProcedure
    .input(z.object({ featureRequestId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Find the associated PRD
      const feature = await ctx.prisma.featureRequest.findFirst({
        where: {
          id: input.featureRequestId,
          project: {
            workspaceId: ctx.workspace.id,
          },
        },
        include: {
          prd: true,
        },
      });

      if (!feature || !feature.prd) {
        return [];
      }

      return ctx.prisma.task.findMany({
        where: {
          prdId: feature.prd.id,
        },
        orderBy: {
          createdAt: "asc",
        },
      });
    }),

  updateTaskStatus: workspaceProcedure
    .input(
      z.object({
        taskId: z.string(),
        status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.prisma.task.findFirst({
        where: {
          id: input.taskId,
          prd: {
            featureRequest: {
              project: {
                workspaceId: ctx.workspace.id,
              },
            },
          },
        },
      });

      if (!task) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Task not found in this workspace.",
        });
      }

      return ctx.prisma.task.update({
        where: { id: input.taskId },
        data: {
          status: input.status,
        },
      });
    }),

  updateTask: workspaceProcedure
    .input(
      z.object({
        taskId: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
        estimateMinutes: z.number().int().min(1).optional(),
        gitBranch: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.prisma.task.findFirst({
        where: {
          id: input.taskId,
          prd: {
            featureRequest: {
              project: {
                workspaceId: ctx.workspace.id,
              },
            },
          },
        },
      });

      if (!task) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Task not found in this workspace.",
        });
      }

      const { taskId, ...updateData } = input;

      return ctx.prisma.task.update({
        where: { id: taskId },
        data: updateData,
      });
    }),
});
