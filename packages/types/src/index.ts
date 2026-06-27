// Shared types for ShipFlow AI

export interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
}

export type UserRole = "OWNER" | "ADMIN" | "DEVELOPER" | "CUSTOMER";

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: UserRole;
}
