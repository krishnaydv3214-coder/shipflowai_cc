import { createOpenAI } from "@ai-sdk/openai";
import { generateText as sdkGenerateText, generateObject as sdkGenerateObject } from "ai";

// Initialize OpenAI provider conditionally
const getOpenAiClient = () => {
  const apiKey = process.env.OPENAI_API_KEY || "mock-api-key";
  return createOpenAI({
    apiKey,
  });
};

export const getAiModel = () => {
  const client = getOpenAiClient();
  return client("gpt-4o-mini");
};

// Check if actual credentials exist
export const hasCredentials = () => {
  return !!process.env.OPENAI_API_KEY;
};

// High-fidelity Mock responses for local fallback without keys
export const mockDiscoveryResponse = (title: string, description: string) => {
  return `Thank you for sharing the feature request for "${title}"!

To help draft a robust Product Requirement Document (PRD), could you clarify a few details:
1. **Target Audience**: Who are the primary users interacting with this feature?
2. **User Flow**: What is the entrypoint and expected user journey?
3. **Integration Constraints**: Are there any external API integrations or specific database structures required for this feature?

*(Note: Running in AI Mock Fallback mode since OPENAI_API_KEY is not configured)*`;
};

export const mockPrdResponse = (title: string, description: string) => {
  return {
    problemStatement: `Users lack a streamlined automated flow to capture, scope, and plan the "${title}" feature request details, leading to gaps in engineering specifications.`,
    goals: [
      `Establish a seamless user interface to view and interact with "${title}" requirements.`,
      `Persist requirement logs and draft status flags directly inside the database.`,
      `Reduce manual overhead for product managers preparing the technical brief.`,
    ],
    nonGoals: [
      `Automate full code generation or direct repository git commits.`,
      `Manage post-release monitoring or support ticketing.`,
    ],
    userStories: [
      `As a Product Manager, I want to generate a PRD from discovery chats so that developers have clear instructions.`,
      `As a Developer, I want to review the goals and edge cases so that I can implement the feature accurately.`,
    ],
    acceptanceCriteria: [
      `Workspace credit balance is successfully verified and deducted before generation.`,
      `Prd details are stored correctly in the database and visible under the dashboard views.`,
      `AI Discovery Chat supports history logs and status tracking.`,
    ],
    edgeCases: [
      `Workspace has insufficient credits (below 5 credits): the process is blocked and returns a clear warning.`,
      `Prd is generated multiple times: the existing document is updated/replaced transactionally.`,
    ],
    successMetrics: [
      `90% reduction in time spent writing initial requirements drafts.`,
      `100% developer alignment on acceptance criteria prior to task registration.`,
    ],
  };
};

// Export Vercel AI SDK methods
export { sdkGenerateText as generateText, sdkGenerateObject as generateObject };
