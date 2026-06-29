import { z } from "zod";
import { createTRPCRouter, protectedProcedure, workspaceProcedure, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

export const workspaceRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const baseSlug = input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      
      let slug = baseSlug;
      let suffix = 1;
      while (true) {
        const existing = await ctx.prisma.workspace.findUnique({
          where: { slug },
        });
        if (!existing) break;
        slug = `${baseSlug}-${suffix}`;
        suffix++;
      }

      return ctx.prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({
          data: {
            name: input.name,
            slug,
          },
        });

        await tx.workspaceMember.create({
          data: {
            workspaceId: workspace.id,
            userId: ctx.session.user.id,
            role: "OWNER",
          },
        });

        await tx.aiCredit.create({
          data: {
            workspaceId: workspace.id,
            balance: 100,
          },
        });

        return workspace;
      });
    }),

  get: workspaceProcedure
    .query(({ ctx }) => {
      return ctx.workspace;
    }),

  getBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const workspace = await ctx.prisma.workspace.findUnique({
        where: { slug: input.slug },
        include: {
          credit: true,
          subscription: true,
        },
      });

      if (!workspace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workspace not found.",
        });
      }

      const member = await ctx.prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: workspace.id,
            userId: ctx.session.user.id,
          },
        },
      });

      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this workspace.",
        });
      }

      return {
        ...workspace,
        role: member.role,
      };
    }),

  update: adminProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.workspace.update({
        where: { id: ctx.workspace.id },
        data: { name: input.name },
      });
    }),

  inviteMember: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(["ADMIN", "DEVELOPER", "CUSTOMER"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existingMember = await ctx.prisma.workspaceMember.findFirst({
        where: {
          workspaceId: ctx.workspace.id,
          user: { email: input.email },
        },
      });

      if (existingMember) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User is already a member of this workspace.",
        });
      }

      return ctx.prisma.invitation.create({
        data: {
          workspaceId: ctx.workspace.id,
          email: input.email,
          role: input.role,
          status: "PENDING",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          inviterId: ctx.session.user.id,
        },
      });
    }),

  removeMember: adminProcedure
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const targetMember = await ctx.prisma.workspaceMember.findUnique({
        where: { id: input.memberId },
      });

      if (!targetMember) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Membership not found.",
        });
      }

      if (targetMember.role === "OWNER") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot remove the workspace OWNER.",
        });
      }

      return ctx.prisma.workspaceMember.delete({
        where: { id: input.memberId },
      });
    }),

  listMembers: workspaceProcedure
    .query(async ({ ctx }) => {
      return ctx.prisma.workspaceMember.findMany({
        where: { workspaceId: ctx.workspace.id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });
    }),
});
