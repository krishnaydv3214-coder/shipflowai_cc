import { Inngest, EventSchemas } from "inngest";
import { prisma } from "@repo/db";
import { getAiModel, hasCredentials, mockDiscoveryResponse, mockPrdResponse, mockTasksResponse, generateText, generateObject } from "@repo/ai";
import { getGitHubClient, hasGithubCredentials } from "@repo/github";
import { z } from "zod";

// Define the schemas for our background events
export type Events = {
  "discovery/message.received": {
    data: {
      workspaceId: string;
      featureRequestId: string;
    };
  };
  "prd/generate": {
    data: {
      workspaceId: string;
      featureRequestId: string;
    };
  };
  "tasks/generate": {
    data: {
      workspaceId: string;
      featureRequestId: string;
    };
  };
  "github/pr.opened": {
    data: {
      installationId: string;
      repository: string;
      pullNumber: number;
      commitSha: string;
    };
  };
};

// Create Inngest client
export const inngest = new Inngest({
  id: "shipflow-ai",
  schemas: new EventSchemas().fromRecord<Events>(),
});

// 1. Discovery Chat Workflow
export const discoveryMessageReceived = inngest.createFunction(
  { id: "discovery-message-received" },
  { event: "discovery/message.received" },
  async ({ event, step }) => {
    const { workspaceId, featureRequestId } = event.data;

    // Deduct 1 Credit
    await step.run("deduct-credit", async () => {
      return prisma.$transaction(async (tx) => {
        const credit = await tx.aiCredit.findUnique({
          where: { workspaceId },
        });

        if (!credit || credit.balance < 1) {
          throw new Error("Insufficient AI credits");
        }

        await tx.aiCredit.update({
          where: { workspaceId },
          data: { balance: { decrement: 1 } },
        });

        await tx.aiCreditLog.create({
          data: {
            workspaceId,
            amount: -1,
            feature: "DISCOVERY",
            metadata: { featureRequestId },
          },
        });
      });
    });

    // Fetch feature request
    const feature = await step.run("fetch-feature", async () => {
      const record = await prisma.featureRequest.findUnique({
        where: { id: featureRequestId },
      });
      if (!record) throw new Error("Feature request not found");
      return record;
    });

    // Generate AI response
    const aiResponseText = await step.run("generate-ai-response", async () => {
      if (!hasCredentials()) {
        return mockDiscoveryResponse(feature.title, feature.description);
      }

      const history = Array.isArray(feature.discoveryLog)
        ? (feature.discoveryLog as any[])
        : [];

      const prompt = `You are an AI requirements gathering assistant for ShipFlow AI. Analyze the user's feature request and conversation history, identify missing requirements/specifications, and ask relevant follow-up questions to help build a clear Product Requirement Document (PRD).

Feature Title: ${feature.title}
Initial Description: ${feature.description}

Conversation History:
${history.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n")}

Assistant Response:`;

      const { text } = await generateText({
        model: getAiModel(),
        prompt,
      });

      return text;
    });

    // Save response to DB
    await step.run("save-ai-response", async () => {
      const currentLog = Array.isArray(feature.discoveryLog)
        ? (feature.discoveryLog as any[])
        : [];

      const updatedLog = [
        ...currentLog,
        {
          role: "assistant",
          content: aiResponseText,
          createdAt: new Date().toISOString(),
        },
      ];

      return prisma.featureRequest.update({
        where: { id: featureRequestId },
        data: {
          discoveryLog: updatedLog,
        },
      });
    });
  }
);

// 2. PRD Generation Workflow
export const prdGenerate = inngest.createFunction(
  { id: "prd-generate" },
  { event: "prd/generate" },
  async ({ event, step }) => {
    const { workspaceId, featureRequestId } = event.data;

    // Deduct 5 Credits
    await step.run("deduct-credits", async () => {
      return prisma.$transaction(async (tx) => {
        const credit = await tx.aiCredit.findUnique({
          where: { workspaceId },
        });

        if (!credit || credit.balance < 5) {
          throw new Error("Insufficient AI credits");
        }

        await tx.aiCredit.update({
          where: { workspaceId },
          data: { balance: { decrement: 5 } },
        });

        await tx.aiCreditLog.create({
          data: {
            workspaceId,
            amount: -5,
            feature: "PRD_GEN",
            metadata: { featureRequestId },
          },
        });
      });
    });

    // Fetch feature request
    const feature = await step.run("fetch-feature", async () => {
      const record = await prisma.featureRequest.findUnique({
        where: { id: featureRequestId },
      });
      if (!record) throw new Error("Feature request not found");
      return record;
    });

    // Generate structured PRD
    const prdData = await step.run("generate-prd-object", async () => {
      if (!hasCredentials()) {
        return mockPrdResponse(feature.title, feature.description);
      }

      const history = Array.isArray(feature.discoveryLog)
        ? (feature.discoveryLog as any[])
        : [];

      const systemPrompt = `You are a Principal Product Manager. Analyze the feature request and the requirements discovery logs to generate a comprehensive Product Requirement Document (PRD) JSON object.`;

      const prompt = `Feature Request Title: ${feature.title}
Feature Description: ${feature.description}

Requirement Discovery Conversations:
${history.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n")}

Format the output strictly as a structured JSON object according to the schema.`;

      const { object } = await generateObject({
        model: getAiModel() as any,
        schema: z.object({
          problemStatement: z.string(),
          goals: z.array(z.string()),
          nonGoals: z.array(z.string()),
          userStories: z.array(z.string()),
          acceptanceCriteria: z.array(z.string()),
          edgeCases: z.array(z.string()),
          successMetrics: z.array(z.string()),
        }) as any,
        system: systemPrompt,
        prompt,
      }) as any;

      return object;
    }) as any;

    // Save PRD and set status to PRD_READY
    await step.run("save-prd-to-db", async () => {
      return prisma.$transaction(async (tx) => {
        await tx.prd.upsert({
          where: { featureRequestId },
          update: {
            problemStatement: prdData.problemStatement,
            goals: prdData.goals.join("\n"),
            nonGoals: prdData.nonGoals.join("\n"),
            userStories: prdData.userStories,
            acceptanceCriteria: prdData.acceptanceCriteria,
            edgeCases: prdData.edgeCases,
            successMetrics: prdData.successMetrics,
          },
          create: {
            featureRequestId,
            problemStatement: prdData.problemStatement,
            goals: prdData.goals.join("\n"),
            nonGoals: prdData.nonGoals.join("\n"),
            userStories: prdData.userStories,
            acceptanceCriteria: prdData.acceptanceCriteria,
            edgeCases: prdData.edgeCases,
            successMetrics: prdData.successMetrics,
          },
        });

        await tx.featureRequest.update({
          where: { id: featureRequestId },
          data: {
            status: "PRD_READY",
          },
        });
      });
    });
  }
);

// 3. Tasks Generation Workflow
export const tasksGenerate = inngest.createFunction(
  { id: "tasks-generate" },
  { event: "tasks/generate" },
  async ({ event, step }) => {
    const { workspaceId, featureRequestId } = event.data;

    // Deduct 2 Credits
    await step.run("deduct-credits", async () => {
      return prisma.$transaction(async (tx) => {
        const credit = await tx.aiCredit.findUnique({
          where: { workspaceId },
        });

        if (!credit || credit.balance < 2) {
          throw new Error("Insufficient AI credits");
        }

        await tx.aiCredit.update({
          where: { workspaceId },
          data: { balance: { decrement: 2 } },
        });

        await tx.aiCreditLog.create({
          data: {
            workspaceId,
            amount: -2,
            feature: "TASK_GEN",
            metadata: { featureRequestId },
          },
        });
      });
    });

    // Fetch feature request & PRD
    const featureWithPrd = await step.run("fetch-feature-and-prd", async () => {
      const record = await prisma.featureRequest.findUnique({
        where: { id: featureRequestId },
        include: { prd: true },
      });
      if (!record) throw new Error("Feature request not found");
      if (!record.prd) throw new Error("PRD not found for feature request");
      return record;
    });

    const prd = featureWithPrd.prd!;

    // Generate tasks details using AI or mock fallback
    const rawTasks = await step.run("generate-tasks-list", async () => {
      if (!hasCredentials()) {
        return mockTasksResponse(featureWithPrd.title);
      }

      const prdContext = `PRD Problem Statement: ${prd.problemStatement}
PRD Goals: ${prd.goals}
User Stories: ${JSON.stringify(prd.userStories)}
Acceptance Criteria: ${JSON.stringify(prd.acceptanceCriteria)}
Edge Cases: ${JSON.stringify(prd.edgeCases)}`;

      const systemPrompt = `You are a Lead Software Architect. Analyze the Product Requirement Document (PRD) details and generate a list of concrete engineering tasks required to build this feature. Output tasks that cover database, backend, frontend, and testing. Use realistic time estimates in minutes. Define dependencies between tasks using the titles of other tasks inside this generated list.`;

      const prompt = `Generate engineering tasks for the following PRD:\n\n${prdContext}`;

      const { object } = await generateObject({
        model: getAiModel() as any,
        schema: z.object({
          tasks: z.array(
            z.object({
              title: z.string(),
              description: z.string(),
              priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
              estimateMinutes: z.number().int().min(1),
              dependencyTitles: z.array(z.string()),
            })
          ) as any,
        }) as any,
        system: systemPrompt,
        prompt,
      }) as any;

      return object.tasks;
    }) as any[];

    // Save tasks inside database transactionally
    await step.run("save-tasks-to-db", async () => {
      return prisma.$transaction(async (tx) => {
        // Delete any existing tasks for this PRD to allow clean regenerations
        await tx.task.deleteMany({
          where: { prdId: prd.id },
        });

        // 1. Create all tasks without dependency relations first, storing their DB IDs mapped by titles
        const titleToIdMap: Record<string, string> = {};
        const createdTasks = [];

        for (const task of rawTasks) {
          const record = await tx.task.create({
            data: {
              prdId: prd.id,
              title: task.title,
              description: task.description,
              status: "TODO",
              priority: task.priority,
              estimateMinutes: task.estimateMinutes,
              dependencies: [], // Will populate in second pass
            },
          });
          titleToIdMap[task.title.toLowerCase()] = record.id;
          createdTasks.push({
            id: record.id,
            title: task.title,
            dependencyTitles: task.dependencyTitles || [],
          });
        }

        // 2. Update each task with its mapped dependency UUIDs
        for (const created of createdTasks) {
          const dependencyIds: string[] = [];
          for (const depTitle of created.dependencyTitles) {
            const matchedId = titleToIdMap[depTitle.toLowerCase()];
            if (matchedId) {
              dependencyIds.push(matchedId);
            }
          }

          if (dependencyIds.length > 0) {
            await tx.task.update({
              where: { id: created.id },
              data: {
                dependencies: dependencyIds,
              },
            });
          }
        }

        // 3. Update the feature request status to DEVELOPMENT
        await tx.featureRequest.update({
          where: { id: featureRequestId },
          data: {
            status: "DEVELOPMENT",
          },
        });
      });
    });
  }
);

// 4. PR Code Review Workflow
export const githubPrOpened = inngest.createFunction(
  { id: "github-pr-opened" },
  { event: "github/pr.opened" },
  async ({ event, step }) => {
    const { installationId, repository, pullNumber, commitSha } = event.data;

    const project = await step.run("fetch-project-by-repo", async () => {
      const record = await prisma.project.findFirst({
        where: { githubRepository: repository },
      });
      if (!record) throw new Error(`No project connected to GitHub repository ${repository}`);
      return record;
    });

    const workspaceId = project.workspaceId;

    // Deduct 10 Credits
    await step.run("deduct-credits", async () => {
      return prisma.$transaction(async (tx) => {
        const credit = await tx.aiCredit.findUnique({
          where: { workspaceId },
        });

        if (!credit || credit.balance < 10) {
          throw new Error("Insufficient AI credits for PR review (10 required)");
        }

        await tx.aiCredit.update({
          where: { workspaceId },
          data: { balance: { decrement: 10 } },
        });

        await tx.aiCreditLog.create({
          data: {
            workspaceId,
            amount: -10,
            feature: "PR_REVIEW",
            metadata: { repository, pullNumber, commitSha },
          },
        });
      });
    });

    const prDetails = await step.run("fetch-pr-details", async () => {
      if (!hasGithubCredentials()) {
        return { branchName: "feat/mock-feature" };
      }
      const octokit = getGitHubClient(installationId);
      const [owner, repoName] = repository.split("/") as [string, string];
      const { data: pr } = await octokit.pulls.get({
        owner,
        repo: repoName,
        pull_number: pullNumber,
      });
      return { branchName: pr.head.ref };
    }) as any;

    const branchName = prDetails.branchName as string;

    const requirementContext = await step.run("fetch-requirement-context", async () => {
      // Try to find a task matching the branch name under this project
      const task = await prisma.task.findFirst({
        where: {
          gitBranch: branchName,
          prd: {
            featureRequest: {
              projectId: project.id,
            },
          },
        },
        include: {
          prd: true,
        },
      }) as any;

      // If not found, select the most recently modified feature request/PRD for this project
      if (!task) {
        const latestFeature = await prisma.featureRequest.findFirst({
          where: {
            projectId: project.id,
          },
          orderBy: {
            updatedAt: "desc",
          },
          include: {
            prd: true,
          },
        });

        if (latestFeature?.prd) {
          return {
            prdId: latestFeature.prd.id,
            problemStatement: latestFeature.prd.problemStatement,
            goals: latestFeature.prd.goals,
            acceptanceCriteria: latestFeature.prd.acceptanceCriteria,
          };
        }
      }

      if (task?.prd) {
        return {
          prdId: task.prd.id,
          problemStatement: task.prd.problemStatement,
          goals: task.prd.goals,
          acceptanceCriteria: task.prd.acceptanceCriteria,
        };
      }

      return {
        prdId: null,
        problemStatement: "No PRD requirements found for this repository's project.",
        goals: "",
        acceptanceCriteria: [] as string[],
      };
    }) as any;

    const checkRunId = await step.run("initialize-github-check", async () => {
      if (!hasGithubCredentials()) {
        return "mock-check-run-id";
      }
      const octokit = getGitHubClient(installationId);
      const [owner, repoName] = repository.split("/") as [string, string];
      const checkRun = await octokit.checks.create({
        owner,
        repo: repoName,
        name: "ShipFlow AI Code Review",
        head_sha: commitSha,
        status: "in_progress",
        started_at: new Date().toISOString(),
      });
      return checkRun.data.id.toString();
    }) as string;

    const prFiles = await step.run("fetch-pr-changed-files", async () => {
      if (!hasGithubCredentials()) {
        return [
          {
            filename: "src/index.ts",
            patch: "@@ -1,3 +1,4 @@\n+console.log('mock change');",
          },
        ];
      }
      const octokit = getGitHubClient(installationId);
      const [owner, repoName] = repository.split("/") as [string, string];
      const { data: files } = await octokit.pulls.listFiles({
        owner,
        repo: repoName,
        pull_number: pullNumber,
      });

      return files.map((file: any) => ({
        filename: file.filename,
        patch: file.patch || "",
      }));
    }) as Array<{ filename: string; patch: string }>;

    const reviewResult = await step.run("ai-diff-analysis", async () => {
      if (!hasCredentials()) {
        const hasBlocking = prFiles.some((f) => f.patch.includes("console.log"));
        return {
          status: hasBlocking ? "CHANGES_REQUESTED" : "APPROVED",
          summary: `ShipFlow AI local mock code review complete. Analyzed ${prFiles.length} file(s). ${hasBlocking ? "Found 1 blocking code issue (avoid using debug console.log statements)." : "No blocking issues found."}`,
          comments: hasBlocking
            ? [
                {
                  path: prFiles[0]!.filename,
                  line: 1,
                  body: "**[BLOCKING]** Debug logging statement found. Remove console.log before merging.",
                  isBlocking: true,
                },
              ]
            : [],
        };
      }

      const prdContext = `PRD Problem Statement: ${requirementContext.problemStatement}
PRD Goals: ${requirementContext.goals}
PRD Acceptance Criteria: ${JSON.stringify(requirementContext.acceptanceCriteria)}`;

      const filesContext = prFiles
        .map((f) => `File: ${f.filename}\nDiff patch:\n${f.patch}`)
        .join("\n\n");

      const systemPrompt = `You are a Principal Software Engineer and QA Director. Analyze the changed files and unified diff patches of this Pull Request against the Product Requirement Document (PRD) requirements and acceptance criteria. Identify code issues, architectural violations, security vulnerabilities, or performance bottlenecks. Mark blocking code issues clearly. Specify the exact filename path and line number (using RIGHT side lines from the patch).`;

      const prompt = `PRD Context:\n${prdContext}\n\nChanged Files Diff:\n${filesContext}\n\nPerform code review.`;

      const { object } = await generateObject({
        model: getAiModel() as any,
        schema: z.object({
          summary: z.string(),
          status: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
          comments: z.array(
            z.object({
              path: z.string(),
              line: z.number().int().min(1),
              body: z.string(),
              isBlocking: z.boolean(),
            })
          ),
        }) as any,
        system: systemPrompt,
        prompt,
      }) as any;

      return object;
    }) as any;

    await step.run("post-github-comments", async () => {
      if (!hasGithubCredentials()) {
        console.log("Mock mode: skipped posting pull request review comments.");
        return;
      }
      const octokit = getGitHubClient(installationId);
      const [owner, repoName] = repository.split("/") as [string, string];

      const formattedComments = (reviewResult.comments || []).map((c: any) => ({
        path: c.path,
        line: c.line,
        side: "RIGHT",
        body: `${c.isBlocking ? "**[BLOCKING]**" : "**[NON-BLOCKING]**"} ${c.body}`,
      }));

      if (formattedComments.length > 0) {
        await octokit.pulls.createReview({
          owner,
          repo: repoName,
          pull_number: pullNumber,
          event: "COMMENT",
          body: `ShipFlow AI code review analysis finished:\n\n**Summary:** ${reviewResult.summary}`,
          comments: formattedComments,
        });
      } else {
        await octokit.issues.createComment({
          owner,
          repo: repoName,
          issue_number: pullNumber,
          body: `ShipFlow AI code review analysis finished:\n\n**Summary:** ${reviewResult.summary}\n\n🟢 No inline comments posted. Code review approved.`,
        });
      }
    });

    await step.run("update-github-check-run", async () => {
      if (!hasGithubCredentials()) {
        console.log("Mock mode: skipped updating GitHub Check Run status.");
        return;
      }
      const octokit = getGitHubClient(installationId);
      const [owner, repoName] = repository.split("/") as [string, string];

      const hasBlocking = (reviewResult.comments || []).some((c: any) => c.isBlocking);

      await octokit.checks.update({
        owner,
        repo: repoName,
        check_run_id: parseInt(checkRunId),
        status: "completed",
        conclusion: hasBlocking ? "failure" : "neutral",
        completed_at: new Date().toISOString(),
        output: {
          title: hasBlocking ? "ShipFlow AI: Changes Requested" : "ShipFlow AI: Review Completed",
          summary: reviewResult.summary,
        },
      });
    });

    await step.run("save-code-review-record", async () => {
      return prisma.$transaction(async (tx) => {
        await tx.codeReview.create({
          data: {
            projectId: project.id,
            pullRequestNumber: pullNumber,
            commitSha: commitSha,
            status: reviewResult.status === "CHANGES_REQUESTED" ? "CHANGES_REQUESTED" : "PENDING",
            summary: reviewResult.summary,
            details: {
              comments: reviewResult.comments || [],
              checkRunId: checkRunId as string,
              installationId: installationId as string,
            },
          },
        });

        // Update the feature request status to REVIEW if associated with the branch
        const associatedFeatureId = requirementContext.prdId
          ? await tx.prd.findUnique({
              where: { id: requirementContext.prdId },
              select: { featureRequestId: true },
            }).then((p) => p?.featureRequestId)
          : null;

        if (associatedFeatureId) {
          await tx.featureRequest.update({
            where: { id: associatedFeatureId },
            data: { status: "REVIEW" },
          });
        }
      });
    });
  }
);

// Export list of functions for mounting
export const functions = [discoveryMessageReceived, prdGenerate, tasksGenerate, githubPrOpened];
