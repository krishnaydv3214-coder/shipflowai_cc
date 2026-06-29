import { z } from "zod";
import { createTRPCRouter, adminProcedure, workspaceProcedure } from "../trpc";
import { billing } from "@repo/billing";

export const billingRouter = createTRPCRouter({
  createSubscriptionSession: adminProcedure
    .input(
      z.object({
        plan: z.enum(["PRO", "ENTERPRISE"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const session = await billing.createSubscriptionSession(input.plan, ctx.workspace.id);
      return session;
    }),

  getCredits: workspaceProcedure.query(async ({ ctx }) => {
    // Retrieve current AI credits balance
    let credit = await ctx.prisma.aiCredit.findUnique({
      where: { workspaceId: ctx.workspace.id },
    });

    // If no credit record exists yet, create default Free tier record (50 credits)
    if (!credit) {
      credit = await ctx.prisma.aiCredit.create({
        data: {
          workspaceId: ctx.workspace.id,
          balance: 50,
          lifetimeAllocated: 50,
        },
      });
    }

    // Retrieve ledger logs (latest 20 logs)
    const logs = await ctx.prisma.aiCreditLog.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return {
      credit,
      logs,
    };
  }),
});
