"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "../../../../../utils/trpc";

type Message = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export default function FeatureDiscoveryChat() {
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;
  const projectId = params.projectId as string;
  const featureId = params.featureId as string;

  const [activeTab, setActiveTab] = useState<"chat" | "prd">("chat");
  const [chatMessage, setChatMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // tRPC Queries
  const { data: workspace, refetch: refetchWorkspace } = trpc.workspace.getBySlug.useQuery({ slug: workspaceSlug });
  const workspaceId = workspace?.id || "";

  // Poll when status is DISCOVERY or when last message is from user (waiting for AI)
  const {
    data: feature,
    isLoading: loadingFeature,
    refetch: refetchFeature,
  } = trpc.feature.get.useQuery(
    { workspaceId, featureRequestId: featureId },
    {
      enabled: !!workspaceId,
      refetchInterval: (query) => {
        const feat = query.state.data;
        if (!feat) return false;
        
        // If status is DISCOVERY or last message is from user, poll every 2s
        const log = Array.isArray(feat.discoveryLog) ? (feat.discoveryLog as Message[]) : [];
        const isWaitingForAi = log.length > 0 && log[log.length - 1].role === "user";
        
        if (feat.status === "DISCOVERY" || isWaitingForAi) {
          return 2000;
        }
        return false;
      },
    }
  );

  // Auto-scroll chat to bottom when log changes
  const chatHistory: Message[] = Array.isArray(feature?.discoveryLog)
    ? (feature.discoveryLog as Message[])
    : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory.length]);

  // If status transitions to PRD_READY while tab was chat, auto-switch to PRD preview
  useEffect(() => {
    if (feature?.status === "PRD_READY") {
      setActiveTab("prd");
      refetchWorkspace();
    }
  }, [feature?.status]);

  // tRPC Mutations
  const sendMessageMutation = trpc.feature.sendMessage.useMutation({
    onSuccess: () => {
      setChatMessage("");
      refetchFeature();
      refetchWorkspace();
    },
  });

  const triggerPrdGenMutation = trpc.feature.triggerPrdGeneration.useMutation({
    onSuccess: () => {
      refetchFeature();
      refetchWorkspace();
    },
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate({
      workspaceId,
      featureRequestId: featureId,
      message: chatMessage,
    });
  };

  const handleGeneratePrd = () => {
    if (triggerPrdGenMutation.isPending) return;
    triggerPrdGenMutation.mutate({
      workspaceId,
      featureRequestId: featureId,
    });
  };

  if (loadingFeature) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-lg text-slate-400">Loading discovery logs...</div>
      </div>
    );
  }

  if (!feature) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-white">
        <h1 className="text-2xl font-bold text-red-400">Feature Request Not Found</h1>
        <p className="mt-2 text-slate-400">The requested feature could not be loaded.</p>
        <Link
          href={`/${workspaceSlug}/${projectId}`}
          className="mt-6 rounded-lg bg-indigo-600 px-6 py-2 font-semibold text-white hover:bg-indigo-500 transition"
        >
          Back to Project
        </Link>
      </div>
    );
  }

  const isWaitingForAi =
    chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === "user";

  // Parse PRD JSON fields if they are arrays or use fallbacks
  const prd = feature.prd;
  const userStories: string[] = Array.isArray(prd?.userStories) ? (prd.userStories as string[]) : [];
  const acceptanceCriteria: string[] = Array.isArray(prd?.acceptanceCriteria)
    ? (prd.acceptanceCriteria as string[])
    : [];
  const edgeCases: string[] = Array.isArray(prd?.edgeCases) ? (prd.edgeCases as string[]) : [];
  const successMetrics: string[] = Array.isArray(prd?.successMetrics)
    ? (prd.successMetrics as string[])
    : [];

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-white">
      {/* Top Header navbar */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/40 px-8 py-4 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <Link
            href={`/${workspaceSlug}/${projectId}`}
            className="text-sm text-slate-400 hover:text-white transition"
          >
            ← Back to Project
          </Link>
          <span className="h-4 w-px bg-slate-800"></span>
          <h1 className="text-lg font-bold truncate max-w-md">{feature.title}</h1>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              feature.status === "PRD_READY"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : feature.status === "DISCOVERY"
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  : "bg-slate-500/10 text-slate-400 border-slate-500/20"
            }`}
          >
            {feature.status}
          </span>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Side: Chat or PRD */}
        <div className="flex flex-col flex-1 bg-slate-950 p-8 overflow-y-auto">
          {/* Tabs bar */}
          <div className="flex gap-4 border-b border-slate-800 pb-px mb-8">
            <button
              onClick={() => setActiveTab("chat")}
              className={`pb-4 text-sm font-semibold transition-colors relative ${
                activeTab === "chat" ? "text-indigo-400" : "text-slate-400 hover:text-white"
              }`}
            >
              Discovery Chat
              {activeTab === "chat" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("prd")}
              className={`pb-4 text-sm font-semibold transition-colors relative ${
                activeTab === "prd" ? "text-indigo-400" : "text-slate-400 hover:text-white"
              }`}
            >
              PRD Preview
              {activeTab === "prd" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />
              )}
            </button>
          </div>

          {/* Tab 1: Discovery Chat */}
          {activeTab === "chat" && (
            <div className="flex flex-col flex-1 rounded-2xl border border-slate-800 bg-slate-900/10 min-h-[500px]">
              {/* Conversational history */}
              <div className="flex-1 p-6 space-y-4 overflow-y-auto max-h-[550px]">
                {/* Initial feature notes */}
                <div className="rounded-xl bg-slate-900/50 border border-slate-800/80 p-4 mb-6">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Initial Feature Request Raw Notes
                  </h4>
                  <p className="text-sm text-slate-200 whitespace-pre-wrap">{feature.description}</p>
                </div>

                {chatHistory.length > 0 ? (
                  chatHistory.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-xl rounded-2xl px-5 py-3 text-sm whitespace-pre-wrap ${
                          msg.role === "user"
                            ? "bg-indigo-600 text-white rounded-br-none shadow-lg shadow-indigo-600/10"
                            : "bg-slate-900 border border-slate-800/60 text-slate-200 rounded-bl-none"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    No chat log exchanges yet. Type a message below to start gathering details with the AI agent.
                  </div>
                )}

                {/* AI Typing loading indicator */}
                {isWaitingForAi && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-bl-none border border-slate-800 bg-slate-900/40 px-5 py-3 text-slate-400 text-sm flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" />
                      <span className="h-2 w-2 rounded-full bg-slate-500 animate-bounce [animation-delay:0.2s]" />
                      <span className="h-2 w-2 rounded-full bg-slate-500 animate-bounce [animation-delay:0.4s]" />
                      <span>AI Discovery assistant is formulating follow-up questions...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input form */}
              <div className="border-t border-slate-800 p-4 bg-slate-900/20">
                <form onSubmit={handleSendMessage} className="flex gap-4">
                  <input
                    type="text"
                    required
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    disabled={sendMessageMutation.isPending || isWaitingForAi}
                    placeholder={
                      isWaitingForAi
                        ? "Waiting for AI response..."
                        : "Ask questions, specify flows, or add clarifications..."
                    }
                    className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none transition disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={sendMessageMutation.isPending || isWaitingForAi}
                    className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-500 transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {sendMessageMutation.isPending ? "Sending..." : "Send"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Tab 2: PRD Preview */}
          {activeTab === "prd" && (
            <div className="flex-1 space-y-6">
              {prd ? (
                <div className="space-y-6 animate-in fade-in duration-350">
                  {/* Problem statement */}
                  <section className="rounded-xl border border-slate-800 bg-slate-900/20 p-6 shadow-md">
                    <h3 className="text-lg font-bold text-indigo-400 mb-3">1. Problem Statement</h3>
                    <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                      {prd.problemStatement}
                    </p>
                  </section>

                  {/* Goals & Non-Goals */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <section className="rounded-xl border border-slate-800 bg-slate-900/20 p-6 shadow-md">
                      <h3 className="text-lg font-bold text-emerald-400 mb-3">2. Goals</h3>
                      <ul className="list-disc list-inside space-y-2 text-slate-300 text-sm">
                        {prd.goals.split("\n").map((g, i) => (
                          <li key={i}>{g}</li>
                        ))}
                      </ul>
                    </section>
                    <section className="rounded-xl border border-slate-800 bg-slate-900/20 p-6 shadow-md">
                      <h3 className="text-lg font-bold text-rose-400 mb-3">3. Non-Goals</h3>
                      <ul className="list-disc list-inside space-y-2 text-slate-300 text-sm">
                        {prd.nonGoals.split("\n").map((g, i) => (
                          <li key={i}>{g}</li>
                        ))}
                      </ul>
                    </section>
                  </div>

                  {/* User Stories */}
                  <section className="rounded-xl border border-slate-800 bg-slate-900/20 p-6 shadow-md">
                    <h3 className="text-lg font-bold text-indigo-400 mb-3">4. User Stories</h3>
                    <div className="space-y-3">
                      {userStories.map((story, i) => (
                        <div key={i} className="flex gap-3 text-slate-300 text-sm border-l-2 border-indigo-500 pl-4 py-1 bg-indigo-500/5">
                          <p>{story}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Acceptance Criteria */}
                  <section className="rounded-xl border border-slate-800 bg-slate-900/20 p-6 shadow-md">
                    <h3 className="text-lg font-bold text-indigo-400 mb-3">5. Acceptance Criteria</h3>
                    <div className="space-y-2">
                      {acceptanceCriteria.map((crit, i) => (
                        <div key={i} className="flex items-start gap-3 text-slate-300 text-sm">
                          <input type="checkbox" readOnly checked className="mt-1 rounded accent-indigo-500" />
                          <p>{crit}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Edge cases & Success metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <section className="rounded-xl border border-slate-800 bg-slate-900/20 p-6 shadow-md">
                      <h3 className="text-lg font-bold text-indigo-400 mb-3">6. Edge Cases</h3>
                      <ul className="list-disc list-inside space-y-2 text-slate-300 text-sm">
                        {edgeCases.map((edge, i) => (
                          <li key={i}>{edge}</li>
                        ))}
                      </ul>
                    </section>
                    <section className="rounded-xl border border-slate-800 bg-slate-900/20 p-6 shadow-md">
                      <h3 className="text-lg font-bold text-indigo-400 mb-3">7. Success Metrics</h3>
                      <ul className="list-disc list-inside space-y-2 text-slate-300 text-sm">
                        {successMetrics.map((met, i) => (
                          <li key={i}>{met}</li>
                        ))}
                      </ul>
                    </section>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/10 py-24 text-center">
                  <div className="mx-auto max-w-sm">
                    <h3 className="text-lg font-bold">No PRD generated yet</h3>
                    <p className="text-sm text-slate-500 mt-2">
                      Use the discovery chat to elaborate requirements, then click "Generate PRD" in the actions panel.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Sidebar Actions */}
        <div className="w-80 border-l border-slate-800 bg-slate-900/30 p-6 space-y-6 overflow-y-auto">
          {/* Workspace Credits Status */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Workspace AI Balance
            </h4>
            {workspace?.credit ? (
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white">
                  {workspace.credit.balance}
                </span>
                <span className="text-slate-500 text-xs">/ 50 credits</span>
              </div>
            ) : (
              <div className="text-slate-400 text-sm">Loading credits balance...</div>
            )}
          </div>

          {/* Actions & Workflows */}
          <div className="space-y-3">
            <button
              onClick={handleGeneratePrd}
              disabled={
                triggerPrdGenMutation.isPending ||
                (workspace?.credit?.balance && workspace.credit.balance < 5)
              }
              className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-3 font-semibold text-sm text-white shadow-lg shadow-indigo-600/15 hover:brightness-110 active:scale-98 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {triggerPrdGenMutation.isPending ? (
                <>Generating PRD...</>
              ) : (
                <>Generate Engineering PRD</>
              )}
            </button>
            <div className="text-center text-slate-500 text-[10px]">
              Deducts 5 AI credits. Generates problem statement, goals, user stories, and acceptance criteria.
            </div>
          </div>

          {/* Feature request Metadata */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/20 p-4 space-y-3 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Feature ID</span>
              <span className="font-mono text-white select-all">{feature.id}</span>
            </div>
            <div className="flex justify-between">
              <span>Status</span>
              <span className="font-semibold text-white">{feature.status}</span>
            </div>
            <div className="flex justify-between">
              <span>Created At</span>
              <span className="text-white">
                {new Date(feature.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
