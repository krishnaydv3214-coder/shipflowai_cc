"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@repo/auth/client";

export default function WorkspacesPage() {
  const router = useRouter();
  const session = authClient.useSession();
  const { data: workspaces, isPending } = authClient.useListOrganizations();

  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    setCreating(true);
    setError("");

    try {
      const response = await authClient.organization.create({
        name: newWorkspaceName,
        slug: newWorkspaceName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, ""),
      });

      if (response.error) {
        setError(response.error.message || "Failed to create workspace");
      } else {
        setNewWorkspaceName("");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  if (session.isPending || isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-lg text-slate-400">Loading workspaces...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-radial from-slate-900 via-slate-950 to-black text-white">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/40 px-8 py-4 backdrop-blur-md">
        <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
          ShipFlow AI
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">
            {session.data?.user.email}
          </span>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-slate-800 px-3 py-1 text-sm text-slate-400 hover:bg-slate-900 hover:text-white transition"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-16">
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold mb-6">Select a Workspace</h2>
            {workspaces && workspaces.length > 0 ? (
              <div className="space-y-4">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {workspaces.map((org: any) => (
                  <Link
                    key={org.id}
                    href={`/${org.slug}`}
                    className="block rounded-xl border border-slate-800 bg-slate-900/40 p-5 hover:border-indigo-500 hover:bg-slate-900/60 transition shadow-lg backdrop-blur-sm group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-lg group-hover:text-indigo-400 transition">
                          {org.name}
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">
                          slug: {org.slug}
                        </p>
                      </div>
                      <span className="text-slate-500 group-hover:text-indigo-400 transition-transform group-hover:translate-x-1 duration-200">
                        ➔
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/20 p-8 text-center text-slate-500">
                You don&apos;t have any workspaces yet. Create one on the right to get started.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-md self-start">
            <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Create Workspace
            </h2>

            {error && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-300">
                  Workspace Name
                </label>
                <input
                  type="text"
                  required
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-2 text-white placeholder-slate-500 outline-none transition duration-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="Acme Corp"
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 py-3 font-semibold text-white shadow-lg transition hover:brightness-110 active:scale-98 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Workspace"}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
