import { z } from "zod";

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(2, "Workspace name must be at least 2 characters").max(50),
});

export const CreateProjectSchema = z.object({
  name: z.string().min(2, "Project name must be at least 2 characters").max(50),
  description: z.string().max(200).optional(),
});

export const CreateFeatureSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(5, "Feature title must be at least 5 characters").max(100),
  description: z.string().min(10, "Feature description must be at least 10 characters"),
});

export const DiscoveryMessageSchema = z.object({
  featureId: z.string().uuid(),
  message: z.string().min(1, "Message cannot be empty"),
});

export const UpdateTaskStatusSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE"]),
});

export const HumanApprovalSchema = z.object({
  reviewId: z.string().uuid(),
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().max(500).optional(),
});
