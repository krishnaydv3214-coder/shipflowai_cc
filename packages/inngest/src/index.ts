import { Inngest } from "inngest";
import { prisma } from "@repo/db";
import { getAiModel, hasCredentials, mockDiscoveryResponse, mockPrdResponse, generateText, generateObject } from "@repo/ai";
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
  schemas: (t) => t.type<Events>(),
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
        model: getAiModel(),
        schema: z.object({
          problemStatement: z.string(),
          goals: z.array(z.string()),
          nonGoals: z.array(z.string()),
          userStories: z.array(z.string()),
          acceptanceCriteria: z.array(z.string()),
          edgeCases: z.array(z.string()),
          successMetrics: z.array(z.string()),
        }),
        system: systemPrompt,
        prompt,
      });

      return object;
    });

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

// Export list of functions for mounting
export const functions = [discoveryMessageReceived, prdGenerate];
