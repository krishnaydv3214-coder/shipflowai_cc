"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "../../utils/trpc";
import { authClient } from "@repo/auth/client";

export default function WorkspaceDashboard() {
  const params = useParams();
  const router = useRouter();
  const slug = params.workspaceSlug as string;

  // Query workspace by slug
  const {
    data: workspace,
    isLoading: loadingWorkspace,
    error: workspaceError,
  } = trpc.workspace.getBySlug.useQuery({ slug });

  // Query projects for the workspace (only run if workspace is loaded)
  const { data: projects, isLoading: loadingProjects } =
    trpc.project.list.useQuery(
      { workspaceId: workspace?.id || "" },
      { enabled: !!workspace?.id }
    );

  const handleLogout = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  if (loadingWorkspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-lg text-slate-400">Loading workspace dashboard...</div>
      </div>
    );
  }

  if (workspaceError || !workspace) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-white">
        <h1 className="text-2xl font-bold text-red-400">Workspace Not Found</h1>
        <p className="mt-2 text-slate-400">
          The workspace you are looking for does not exist or you don&apos;t have access.
        </p>
        <Link
          href="/workspaces"
          className="mt-6 rounded-lg bg-indigo-600 px-6 py-2 font-semibold text-white hover:bg-indigo-500 transition"
        >
          Back to Workspaces
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-radial from-slate-900 via-slate-950 to-black text-white">
      {/* Top Header navbar */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/40 px-8 py-4 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <Link
            href="/workspaces"
            className="text-sm text-slate-400 hover:text-white transition"
          >
            ← Workspaces
          </Link>
          <span className="h-4 w-px bg-slate-800"></span>
          <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            {workspace.name}
          </h1>
        </div>
        <div className="flex items-center gap-6">
          {workspace.credit && (
            <div className="rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1 text-sm font-semibold text-amber-400 shadow-md">
              💰 {workspace.credit.balance} AI Credits
            </div>
          )}
          <Link
            href={`/${slug}/settings`}
            className="text-sm text-slate-400 hover:text-white transition"
          >
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-slate-800 px-3 py-1 text-sm text-slate-400 hover:bg-slate-900 hover:text-white transition"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main dashboard content */}
      <main className="mx-auto max-w-6xl px-8 py-12">
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight">Projects</h2>
            <p className="text-slate-400 mt-2">
              Select or create a project to generate tasks and review code
            </p>
          </div>
          <Link
            href={`/${slug}/create-project`}
            className="rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 font-semibold text-white shadow-lg transition hover:brightness-110 active:scale-98"
          >
            + New Project
          </Link>
        </div>

        {loadingProjects ? (
          <div className="text-slate-400">Loading projects...</div>
        ) : projects && projects.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/${slug}/${project.id}`}
                className="group relative rounded-xl border border-slate-800 bg-slate-900/40 p-6 hover:border-indigo-500 hover:bg-slate-900/60 transition-all duration-300 shadow-lg backdrop-blur-sm flex flex-col justify-between h-48"
              >
                <div>
                  <h3 className="font-bold text-xl group-hover:text-indigo-400 transition-colors">
                    {project.name}
                  </h3>
                  <p className="text-sm text-slate-400 mt-2 line-clamp-2">
                    {project.description || "No description provided."}
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-800/60 pt-4 text-xs text-slate-500">
                  <span>
                    {project.githubRepository ? (
                      <span className="flex items-center gap-1 text-emerald-400">
                        🟢 GitHub Connected
                      </span>
                    ) : (
                      "⚪ GitHub Not Connected"
                    )}
                  </span>
                  <span className="group-hover:text-indigo-400 transition-transform group-hover:translate-x-1 duration-200">
                    Open ➔
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 py-16 text-center shadow-inner">
            <div className="mx-auto max-w-sm">
              <h3 className="text-lg font-bold">No projects yet</h3>
              <p className="text-sm text-slate-500 mt-2">
                Create a project to connect a GitHub repository and generate PRDs with AI.
              </p>
              <Link
                href={`/${slug}/create-project`}
                className="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition"
              >
                Create First Project
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
