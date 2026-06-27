import { createTRPCReact, type CreateTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@repo/api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const trpc: CreateTRPCReact<AppRouter, any> = createTRPCReact<AppRouter>();
export type { AppRouter };
