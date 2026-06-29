import { z } from "zod";
import { createTRPCRouter, workspaceProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { getGitHubClient, hasGithubCredentials } from "@repo/github";

export const reviewRouter = createTRPCRouter({
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

      return ctx.prisma.codeReview.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "desc" },
      });
    }),

  get: workspaceProcedure
    .input(z.object({ reviewId: z.string() }))
    .query(async ({ ctx, input }) => {
      const review = await ctx.prisma.codeReview.findFirst({
        where: {
          id: input.reviewId,
          project: {
            workspaceId: ctx.workspace.id,
          },
        },
        include: {
          project: true,
        },
      });

      if (!review) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Code review record not found.",
        });
      }

      return review;
    }),

  getByFeatureId: workspaceProcedure
    .input(z.object({ featureRequestId: z.string() }))
    .query(async ({ ctx, input }) => {
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

      return ctx.prisma.codeReview.findFirst({
        where: {
          projectId: feature.projectId,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    }),

  submitHumanApproval: workspaceProcedure
    .input(
      z.object({
        reviewId: z.string(),
        decision: z.enum(["APPROVE", "REJECT"]),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check user role is DEVELOPER or higher
      const role = ctx.membership.role;
      if (role !== "OWNER" && role !== "ADMIN" && role !== "DEVELOPER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only developers or administrators can approve code reviews.",
        });
      }

      const review = await ctx.prisma.codeReview.findFirst({
        where: {
          id: input.reviewId,
          project: {
            workspaceId: ctx.workspace.id,
          },
        },
        include: {
          project: true,
        },
      });

      if (!review) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Code review not found.",
        });
      }

      const newStatus = input.decision === "APPROVE" ? "APPROVED" : "CHANGES_REQUESTED";

      // Update in DB
      const updatedReview = await ctx.prisma.codeReview.update({
        where: { id: input.reviewId },
        data: {
          status: newStatus,
        },
      });

      // Update GitHub Check Run status if configured
      const details = review.details as any;
      const checkRunId = details?.checkRunId;
      const installationId = details?.installationId;

      if (checkRunId && installationId && review.project.githubRepository) {
        if (hasGithubCredentials()) {
          try {
            const octokit = getGitHubClient(installationId);
            const [owner, repoName] = review.project.githubRepository.split("/") as [string, string];

            // Update Check Run conclusion
            await octokit.checks.update({
              owner,
              repo: repoName,
              check_run_id: parseInt(checkRunId),
              status: "completed",
              conclusion: input.decision === "APPROVE" ? "success" : "failure",
              completed_at: new Date().toISOString(),
              output: {
                title: input.decision === "APPROVE" ? "Approved by Human Reviewer" : "Changes Requested by Human Reviewer",
                summary: input.comment || `Human reviewer decision: ${input.decision}`,
              },
            });

            // Post a general pull request comment with the reviewer decision
            await octokit.issues.createComment({
              owner,
              repo: repoName,
              issue_number: review.pullRequestNumber,
              body: `### ShipFlow AI: Human Review Decision\n\n**Reviewer:** ${ctx.session.user.name || ctx.session.user.email}\n**Decision:** ${input.decision}\n**Comments:** ${input.comment || "_None provided._"}`,
            });

            // If approved, trigger pull request merge
            if (input.decision === "APPROVE") {
              await octokit.pulls.merge({
                owner,
                repo: repoName,
                pull_number: review.pullRequestNumber,
                commit_title: `ShipFlow AI: Merge PR #${review.pullRequestNumber} (Approved by Human)`,
              });
            }
          } catch (githubError: any) {
            console.error("Error updating GitHub status checks during human approval:", githubError);
          }
        } else {
          console.warn("GitHub credentials missing. Simulated human approval state change on check run:", checkRunId);
        }
      }

      return updatedReview;
    }),
});
