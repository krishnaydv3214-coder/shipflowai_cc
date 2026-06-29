"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "../../../utils/trpc";

export default function ProjectDashboard() {
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;
  const projectId = params.projectId as string;

  const [activeTab, setActiveTab] = useState<"features" | "settings">("features");
  
  // Feature Creation Form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFeatureTitle, setNewFeatureTitle] = useState("");
  const [newFeatureDesc, setNewFeatureDesc] = useState("");

  // GitHub Connection state
  const [githubRepoInput, setGithubRepoInput] = useState("");

  // tRPC Queries
  const { data: workspace } = trpc.workspace.getBySlug.useQuery({ slug: workspaceSlug });
  const workspaceId = workspace?.id || "";

  const {
    data: project,
    isLoading: loadingProject,
    refetch: refetchProject,
  } = trpc.project.get.useQuery(
    { workspaceId, projectId },
    { enabled: !!workspaceId }
  );

  const {
    data: features,
    isLoading: loadingFeatures,
    refetch: refetchFeatures,
  } = trpc.feature.list.useQuery(
    { workspaceId, projectId },
    { enabled: !!workspaceId }
  );

  const featuresList = (features as any[]) || [];

  // tRPC Mutations
  const createFeatureMutation = trpc.feature.create.useMutation({
    onSuccess: () => {
      refetchFeatures();
      setNewFeatureTitle("");
      setNewFeatureDesc("");
      setShowCreateModal(false);
    },
  });

  const connectGithubMutation = trpc.project.connectGithub.useMutation({
    onSuccess: () => {
      refetchProject();
      setGithubRepoInput("");
    },
  });

  const handleCreateFeature = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFeatureTitle || !newFeatureDesc) return;
    createFeatureMutation.mutate({
      workspaceId,
      projectId,
      title: newFeatureTitle,
      description: newFeatureDesc,
    });
  };

  const handleConnectGithub = (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubRepoInput) return;
    connectGithubMutation.mutate({
      workspaceId,
      projectId,
      repository: githubRepoInput,
    });
  };

  if (loadingProject) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-lg text-slate-400">Loading project data...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-white">
        <h1 className="text-2xl font-bold text-red-400">Project Not Found</h1>
        <p className="mt-2 text-slate-400">The project could not be loaded.</p>
        <Link
          href={`/${workspaceSlug}`}
          className="mt-6 rounded-lg bg-indigo-600 px-6 py-2 font-semibold text-white hover:bg-indigo-500 transition"
        >
          Back to Dashboard
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
            href={`/${workspaceSlug}`}
            className="text-sm text-slate-400 hover:text-white transition"
          >
            ← Workspace Dashboard
          </Link>
          <span className="h-4 w-px bg-slate-800"></span>
          <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            {project.name}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {project.githubRepository && (
            <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
              🔗 {project.githubRepository}
            </div>
          )}
        </div>
      </header>

      {/* Workspace wrapper */}
      <main className="mx-auto max-w-6xl px-8 py-12">
        {/* Tabs navigation */}
        <div className="mb-8 flex gap-4 border-b border-slate-800 pb-px">
          <button
            onClick={() => setActiveTab("features")}
            className={`pb-4 text-sm font-semibold transition-colors relative ${
              activeTab === "features" ? "text-indigo-400" : "text-slate-400 hover:text-white"
            }`}
          >
            Feature Requests
            {activeTab === "features" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`pb-4 text-sm font-semibold transition-colors relative ${
              activeTab === "settings" ? "text-indigo-400" : "text-slate-400 hover:text-white"
            }`}
          >
            Project Settings
            {activeTab === "settings" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />
            )}
          </button>
        </div>

        {/* Tab 1: Features */}
        {activeTab === "features" && (
          <div>
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Feature Requests Pipeline</h2>
                <p className="text-slate-400 text-sm mt-1">
                  Draft feature requests, run discovery with AI, and generate engineering specifications
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition shadow-lg shadow-indigo-600/25"
              >
                + New Feature Request
              </button>
            </div>

            {loadingFeatures ? (
              <div className="text-slate-400">Loading features...</div>
            ) : featuresList.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/20 backdrop-blur-sm shadow-xl">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      <th className="px-6 py-4">Title</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Discovery Steps</th>
                      <th className="px-6 py-4">Created At</th>
                      <th className="px-6 py-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {featuresList.map((feat) => {
                      const chatLog = Array.isArray(feat.discoveryLog)
                        ? (feat.discoveryLog as any[])
                        : [];
                      
                      let statusColor = "bg-slate-500/10 text-slate-400 border-slate-500/20";
                      if (feat.status === "DISCOVERY") {
                        statusColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                      } else if (feat.status === "PRD_READY") {
                        statusColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                      }

                      return (
                        <tr
                          key={feat.id}
                          className="hover:bg-slate-900/20 transition-colors group"
                        >
                          <td className="px-6 py-4 font-semibold text-white group-hover:text-indigo-400 transition-colors">
                            <Link href={`/${workspaceSlug}/${projectId}/feature/${feat.id}`} className="block">
                              {feat.title}
                            </Link>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusColor}`}>
                              {feat.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-400">
                            {chatLog.length} exchanges
                          </td>
                          <td className="px-6 py-4 text-slate-400">
                            {new Date(feat.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4">
                            <Link
                              href={`/${workspaceSlug}/${projectId}/feature/${feat.id}`}
                              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
                            >
                              Open AI Discovery ➔
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 py-16 text-center shadow-inner">
                <div className="mx-auto max-w-sm">
                  <h3 className="text-lg font-bold">No feature requests yet</h3>
                  <p className="text-sm text-slate-500 mt-2">
                    Create a feature request to start gathering requirement specifications with AI.
                  </p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition"
                  >
                    Create First Feature
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Settings */}
        {activeTab === "settings" && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold mb-6">Connect GitHub Repository</h2>
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 shadow-lg">
              <form onSubmit={handleConnectGithub} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    GitHub Repository (Format: owner/repo)
                  </label>
                  <input
                    type="text"
                    required
                    value={githubRepoInput}
                    onChange={(e) => setGithubRepoInput(e.target.value)}
                    placeholder="e.g. shipflowai/core"
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-2.5 text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none transition"
                  />
                </div>
                <button
                  type="submit"
                  disabled={connectGithubMutation.isPending}
                  className="rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 font-semibold text-white shadow-md hover:brightness-110 active:scale-98 transition disabled:opacity-50"
                >
                  {connectGithubMutation.isPending ? "Connecting..." : "Connect Repository"}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Creation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
              <h3 className="text-xl font-bold">New Feature Request</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateFeature} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Feature Title
                </label>
                <input
                  type="text"
                  required
                  value={newFeatureTitle}
                  onChange={(e) => setNewFeatureTitle(e.target.value)}
                  placeholder="e.g. Add Multi-tenant Billing"
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-2.5 text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none transition"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Initial Description / Raw Notes
                </label>
                <textarea
                  required
                  rows={4}
                  value={newFeatureDesc}
                  onChange={(e) => setNewFeatureDesc(e.target.value)}
                  placeholder="Provide any raw inputs, user requests, or high-level requirements..."
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-2.5 text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none transition resize-none"
                />
              </div>
              <div className="flex justify-end gap-4 border-t border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-slate-800 px-4 py-2 text-sm text-slate-400 hover:bg-slate-900 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createFeatureMutation.isPending}
                  className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition disabled:opacity-50"
                >
                  {createFeatureMutation.isPending ? "Creating..." : "Create Feature"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
