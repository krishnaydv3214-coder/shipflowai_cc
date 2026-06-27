import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createTRPCContext } from "@repo/api";
import { auth } from "@repo/auth";

const handler = async (req: Request) => {
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () =>
      createTRPCContext({
        headers: req.headers,
        session: session ? { user: session.user } : null,
      }),
  });
};

export { handler as GET, handler as POST };
