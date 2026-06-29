import { Inngest, EventSchemas } from "inngest";
import { prisma } from "@repo/db";
import { getAiModel, hasCredentials, mockDiscoveryResponse, mockPrdResponse, mockTasksResponse, generateText, generateObject } from "@repo/ai";
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

// Export list of functions for mounting
export const functions = [discoveryMessageReceived, prdGenerate, tasksGenerate];
