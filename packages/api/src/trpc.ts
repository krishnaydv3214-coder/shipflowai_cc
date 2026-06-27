import { initTRPC, TRPCError } from "@trpc/server";
import { prisma } from "@repo/db";
import { z } from "zod";

export interface CreateContextOptions {
  headers: Headers;
  session: { user: { id: string; email: string; name?: string | null } } | null;
}

export const createTRPCContext = async (opts: CreateContextOptions) => {
  return {
    headers: opts.headers,
    session: opts.session,
    prisma,
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create();

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

// Asserts user is authenticated
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

// Middleware checking workspace membership
export const workspaceProcedure = protectedProcedure
  .input(z.object({ workspaceId: z.string() }))
  .use(async ({ ctx, input, next }) => {
    const member = await ctx.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: input.workspaceId,
          userId: ctx.session.user.id,
        },
      },
      include: {
        workspace: true,
      },
    });

    if (!member) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You are not a member of this workspace.",
      });
    }

    return next({
      ctx: {
        ...ctx,
        workspace: member.workspace,
        membership: member,
      },
    });
  });

// Helper procedure checking workspace membership + role requirement (OWNER or ADMIN)
export const adminProcedure = workspaceProcedure.use(({ ctx, next }) => {
  if (ctx.membership.role !== "OWNER" && ctx.membership.role !== "ADMIN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin permission required.",
    });
  }
  return next();
});

// Helper procedure checking workspace membership + owner requirement
export const ownerProcedure = workspaceProcedure.use(({ ctx, next }) => {
  if (ctx.membership.role !== "OWNER") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Workspace owner permission required.",
    });
  }
  return next();
});
