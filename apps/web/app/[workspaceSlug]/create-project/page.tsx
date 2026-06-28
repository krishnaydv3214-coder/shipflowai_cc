"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "../../../utils/trpc";

export default function CreateProjectPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.workspaceSlug as string;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { data: workspace } = trpc.workspace.getBySlug.useQuery({ slug });

  const createProjectMutation = trpc.project.create.useMutation({
    onSuccess: () => {
      router.push(`/${slug}`);
      router.refresh();
    },
    onError: (err) => {
      setError(err.message || "Failed to create project");
      setLoading(false);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !workspace) return;

    setLoading(true);
    setError("");

    createProjectMutation.mutate({
      workspaceId: workspace.id,
      name,
      description,
    });
  };

  return (
    <div className="min-h-screen bg-radial from-slate-900 via-slate-950 to-black text-white">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/40 px-8 py-4 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <Link
            href={`/${slug}`}
            className="text-sm text-slate-400 hover:text-white transition"
          >
            ← Back to Dashboard
          </Link>
          <span className="h-4 w-px bg-slate-800"></span>
          <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Create Project
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-md">
          <h2 className="text-2xl font-bold mb-6">Create New Project</h2>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-300">
                Project Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-2 text-white placeholder-slate-500 outline-none transition duration-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="Marketing Web App"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-2 text-white placeholder-slate-500 outline-none transition duration-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
                placeholder="Brief description of your project..."
              />
            </div>

            <button
              type="submit"
              disabled={loading || !workspace}
              className="w-full rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 py-3 font-semibold text-white shadow-lg transition hover:brightness-110 active:scale-98 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Project"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
