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
 
type Task = {
  id: string;
  prdId: string;
  title: string;
  description: string;
  status: "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  estimateMinutes: number;
  dependencies: string[];
  gitBranch: string | null;
  createdAt: string;
  updatedAt: string;
};
 
export default function FeatureDiscoveryChat() {
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;
  const projectId = params.projectId as string;
  const featureId = params.featureId as string;
 
  const [activeTab, setActiveTab] = useState<"chat" | "prd" | "kanban">("chat");
  const [chatMessage, setChatMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
 
  // Task Editing States
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("LOW");
  const [editEstimate, setEditEstimate] = useState(60);
  const [editBranch, setEditBranch] = useState("");
 
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
 
  // Fetch tasks for the Kanban Board tab
  const {
    data: tasksData,
    refetch: refetchTasks,
    isLoading: loadingTasks,
  } = trpc.feature.getTasks.useQuery(
    { workspaceId, featureRequestId: featureId },
    {
      enabled: !!workspaceId,
      refetchInterval: (query) => {
        const list = query.state.data;
        // Poll every 2s if feature status is DEVELOPMENT but no tasks have been created/loaded yet
        if (feature?.status === "DEVELOPMENT" && (!list || list.length === 0)) {
          return 2000;
        }
        return false;
      },
    }
  );
 
  const tasks = (tasksData as unknown as Task[]) || [];
 
  // Auto-scroll chat to bottom when log changes
  const chatHistory: Message[] = Array.isArray(feature?.discoveryLog)
    ? (feature.discoveryLog as Message[])
    : [];
 
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory.length]);
 
  // Auto-switch tabs based on status transition
  useEffect(() => {
    if (feature?.status === "PRD_READY") {
      setActiveTab("prd");
      refetchWorkspace();
    } else if (feature?.status === "DEVELOPMENT") {
      setActiveTab("kanban");
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
 
  const triggerTasksGenMutation = trpc.feature.triggerTasksGeneration.useMutation({
    onSuccess: () => {
      refetchFeature();
      refetchTasks();
    },
  });
 
  const updateTaskStatusMutation = trpc.feature.updateTaskStatus.useMutation({
    onSuccess: () => {
      refetchTasks();
    },
  });
 
  const updateTaskMutation = trpc.feature.updateTask.useMutation({
    onSuccess: () => {
      setIsEditingTask(false);
      setSelectedTask(null);
      refetchTasks();
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
 
  const handleGenerateTasks = () => {
    if (triggerTasksGenMutation.isPending) return;
    triggerTasksGenMutation.mutate({
      workspaceId,
      featureRequestId: featureId,
    });
  };
 
  const handleMoveTask = (taskId: string, currentStatus: string, direction: "left" | "right") => {
    const statusOrder: Task["status"][] = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];
    const currentIndex = statusOrder.indexOf(currentStatus as Task["status"]);
    let newIndex = currentIndex;
 
    if (direction === "left" && currentIndex > 0) {
      newIndex = currentIndex - 1;
    } else if (direction === "right" && currentIndex < statusOrder.length - 1) {
      newIndex = currentIndex + 1;
    }
 
    if (newIndex !== currentIndex) {
      updateTaskStatusMutation.mutate({
        workspaceId,
        taskId,
        status: statusOrder[newIndex],
      });
    }
  };
 
  const handleOpenTaskDetails = (task: Task) => {
    setSelectedTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description);
    setEditPriority(task.priority);
    setEditEstimate(task.estimateMinutes);
    setEditBranch(task.gitBranch || "");
    setIsEditingTask(true);
  };
 
  const handleSaveTaskDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || updateTaskMutation.isPending) return;
 
    updateTaskMutation.mutate({
      workspaceId,
      taskId: selectedTask.id,
      title: editTitle,
      description: editDescription,
      priority: editPriority,
      estimateMinutes: editEstimate,
      gitBranch: editBranch || null,
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
 
  // Group tasks by status columns
  const todoTasks = tasks.filter((t) => t.status === "TODO");
  const inProgressTasks = tasks.filter((t) => t.status === "IN_PROGRESS");
  const reviewTasks = tasks.filter((t) => t.status === "REVIEW");
  const doneTasks = tasks.filter((t) => t.status === "DONE");
 
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
              feature.status === "DEVELOPMENT"
                ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                : feature.status === "PRD_READY"
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
        {/* Left Side: Chat, PRD or Kanban */}
        <div className="flex flex-col flex-1 bg-slate-950 p-8 overflow-y-auto">
          {/* Tabs bar */}
          <div className="flex gap-6 border-b border-slate-800 pb-px mb-8">
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
            {prd && (
              <button
                onClick={() => setActiveTab("kanban")}
                className={`pb-4 text-sm font-semibold transition-colors relative ${
                  activeTab === "kanban" ? "text-indigo-400" : "text-slate-400 hover:text-white"
                }`}
              >
                Kanban Board
                {activeTab === "kanban" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />
                )}
              </button>
            )}
          </div>
 
          {/* Tab 1: Discovery Chat */}
          {activeTab === "chat" && (
            <div className="flex flex-col flex-1 rounded-2xl border border-slate-800 bg-slate-900/10 min-h-[500px]">
              {/* Conversational history */}
              <div className="flex-1 p-6 space-y-4 overflow-y-auto max-h-[550px]">
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
                  <section className="rounded-xl border border-slate-800 bg-slate-900/20 p-6 shadow-md">
                    <h3 className="text-lg font-bold text-indigo-400 mb-3">1. Problem Statement</h3>
                    <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                      {prd.problemStatement}
                    </p>
                  </section>
 
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
 
          {/* Tab 3: Kanban Board */}
          {activeTab === "kanban" && (
            <div className="flex-1 flex flex-col space-y-6 min-h-[500px]">
              {/* Empty state or list view */}
              {loadingTasks && tasks.length === 0 ? (
                <div className="text-slate-400 text-center py-24">Loading Kanban tasks...</div>
              ) : tasks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/10 py-20 px-6 text-center max-w-xl mx-auto my-12 shadow-xl backdrop-blur-xs flex flex-col items-center">
                  <div className="rounded-full bg-indigo-500/10 p-4 border border-indigo-500/20 mb-6 text-2xl">
                    📋
                  </div>
                  <h3 className="text-xl font-bold text-white">Generate Kanban Board Tasks</h3>
                  <p className="text-sm text-slate-400 mt-3 max-w-md leading-relaxed">
                    Deconstruct goals, acceptance criteria, and user stories into technical work items with estimates and dependencies.
                  </p>
                  <button
                    onClick={handleGenerateTasks}
                    disabled={triggerTasksGenMutation.isPending}
                    className="mt-8 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3 font-semibold text-sm hover:brightness-110 active:scale-98 transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                  >
                    {triggerTasksGenMutation.isPending ? "Analyzing PRD & Generating..." : "Generate Kanban Tasks"}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col flex-1">
                  {/* Kanban Columns Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start h-[650px]">
                    {/* Column 1: TODO */}
                    <div className="flex flex-col h-full bg-slate-900/25 border border-slate-900 rounded-2xl p-4 overflow-y-auto">
                      <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/60">
                        <span className="text-sm font-bold text-slate-300">To Do</span>
                        <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-400">
                          {todoTasks.length}
                        </span>
                      </div>
                      <div className="space-y-4">
                        {todoTasks.map((task) => (
                          <div
                            key={task.id}
                            onClick={() => handleOpenTaskDetails(task)}
                            className="group cursor-pointer rounded-xl border border-slate-800 bg-slate-900/40 p-4 hover:border-indigo-500/60 hover:bg-slate-900/60 transition duration-300 shadow-md flex flex-col justify-between min-h-[140px]"
                          >
                            <div>
                              <h4 className="font-bold text-sm text-white group-hover:text-indigo-400 transition-colors">
                                {task.title}
                              </h4>
                              <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                                {task.description}
                              </p>
                            </div>
                            <div className="mt-4 pt-3 border-t border-slate-800/40 flex items-center justify-between text-[10px] text-slate-500 font-sans">
                              <span className={`px-2 py-0.5 rounded-full font-semibold border ${
                                task.priority === "URGENT"
                                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                  : task.priority === "HIGH"
                                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                    : task.priority === "MEDIUM"
                                      ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                      : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                              }`}>
                                {task.priority}
                              </span>
                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <span className="font-mono text-slate-400">{task.estimateMinutes}m</span>
                                <button
                                  onClick={() => handleMoveTask(task.id, task.status, "right")}
                                  className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                                >
                                  ➔
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
 
                    {/* Column 2: IN PROGRESS */}
                    <div className="flex flex-col h-full bg-slate-900/25 border border-slate-900 rounded-2xl p-4 overflow-y-auto">
                      <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/60">
                        <span className="text-sm font-bold text-blue-400">In Progress</span>
                        <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-400 border border-blue-500/20">
                          {inProgressTasks.length}
                        </span>
                      </div>
                      <div className="space-y-4">
                        {inProgressTasks.map((task) => (
                          <div
                            key={task.id}
                            onClick={() => handleOpenTaskDetails(task)}
                            className="group cursor-pointer rounded-xl border border-slate-800 bg-slate-900/40 p-4 hover:border-indigo-500/60 hover:bg-slate-900/60 transition duration-300 shadow-md flex flex-col justify-between min-h-[140px]"
                          >
                            <div>
                              <h4 className="font-bold text-sm text-white group-hover:text-indigo-400 transition-colors">
                                {task.title}
                              </h4>
                              <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                                {task.description}
                              </p>
                            </div>
                            <div className="mt-4 pt-3 border-t border-slate-800/40 flex items-center justify-between text-[10px] text-slate-500 font-sans">
                              <span className={`px-2 py-0.5 rounded-full font-semibold border ${
                                task.priority === "URGENT"
                                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                  : task.priority === "HIGH"
                                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                    : task.priority === "MEDIUM"
                                      ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                      : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                              }`}>
                                {task.priority}
                              </span>
                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <span className="font-mono text-slate-400">{task.estimateMinutes}m</span>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleMoveTask(task.id, task.status, "left")}
                                    className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                                  >
                                    ⬅
                                  </button>
                                  <button
                                    onClick={() => handleMoveTask(task.id, task.status, "right")}
                                    className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                                  >
                                    ➔
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
 
                    {/* Column 3: REVIEW */}
                    <div className="flex flex-col h-full bg-slate-900/25 border border-slate-900 rounded-2xl p-4 overflow-y-auto">
                      <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/60">
                        <span className="text-sm font-bold text-amber-400">Review</span>
                        <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400 border border-amber-500/20">
                          {reviewTasks.length}
                        </span>
                      </div>
                      <div className="space-y-4">
                        {reviewTasks.map((task) => (
                          <div
                            key={task.id}
                            onClick={() => handleOpenTaskDetails(task)}
                            className="group cursor-pointer rounded-xl border border-slate-800 bg-slate-900/40 p-4 hover:border-indigo-500/60 hover:bg-slate-900/60 transition duration-300 shadow-md flex flex-col justify-between min-h-[140px]"
                          >
                            <div>
                              <h4 className="font-bold text-sm text-white group-hover:text-indigo-400 transition-colors">
                                {task.title}
                              </h4>
                              <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                                {task.description}
                              </p>
                            </div>
                            <div className="mt-4 pt-3 border-t border-slate-800/40 flex items-center justify-between text-[10px] text-slate-500 font-sans">
                              <span className={`px-2 py-0.5 rounded-full font-semibold border ${
                                task.priority === "URGENT"
                                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                  : task.priority === "HIGH"
                                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                    : task.priority === "MEDIUM"
                                      ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                      : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                              }`}>
                                {task.priority}
                              </span>
                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <span className="font-mono text-slate-400">{task.estimateMinutes}m</span>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleMoveTask(task.id, task.status, "left")}
                                    className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                                  >
                                    ⬅
                                  </button>
                                  <button
                                    onClick={() => handleMoveTask(task.id, task.status, "right")}
                                    className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                                  >
                                    ➔
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
 
                    {/* Column 4: DONE */}
                    <div className="flex flex-col h-full bg-slate-900/25 border border-slate-900 rounded-2xl p-4 overflow-y-auto">
                      <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/60">
                        <span className="text-sm font-bold text-emerald-400">Done</span>
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                          {doneTasks.length}
                        </span>
                      </div>
                      <div className="space-y-4">
                        {doneTasks.map((task) => (
                          <div
                            key={task.id}
                            onClick={() => handleOpenTaskDetails(task)}
                            className="group cursor-pointer rounded-xl border border-slate-800 bg-slate-900/40 p-4 hover:border-indigo-500/60 hover:bg-slate-900/60 transition duration-300 shadow-md flex flex-col justify-between min-h-[140px]"
                          >
                            <div>
                              <h4 className="font-bold text-sm text-slate-300 line-through group-hover:text-emerald-400 transition-colors">
                                {task.title}
                              </h4>
                              <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">
                                {task.description}
                              </p>
                            </div>
                            <div className="mt-4 pt-3 border-t border-slate-800/40 flex items-center justify-between text-[10px] text-slate-500 font-sans">
                              <span className="px-2 py-0.5 rounded-full font-semibold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                COMPLETED
                              </span>
                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <span className="font-mono text-slate-500">{task.estimateMinutes}m</span>
                                <button
                                  onClick={() => handleMoveTask(task.id, task.status, "left")}
                                  className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                                >
                                  ⬅
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
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
          <div className="space-y-4">
            {/* PRD action */}
            {!prd && (
              <div className="space-y-3">
                <button
                  onClick={handleGeneratePrd}
                  disabled={
                    triggerPrdGenMutation.isPending ||
                    (workspace?.credit?.balance && workspace.credit.balance < 5)
                  }
                  className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-3 font-semibold text-sm text-white shadow-lg shadow-indigo-600/15 hover:brightness-110 active:scale-98 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {triggerPrdGenMutation.isPending ? "Generating PRD..." : "Generate Engineering PRD"}
                </button>
                <div className="text-center text-slate-500 text-[10px]">
                  Deducts 5 AI credits. Generates problem statement, goals, user stories, and acceptance criteria.
                </div>
              </div>
            )}
 
            {/* Kanban tasks action */}
            {prd && tasks.length === 0 && (
              <div className="space-y-3">
                <button
                  onClick={handleGenerateTasks}
                  disabled={triggerTasksGenMutation.isPending}
                  className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-3 font-semibold text-sm text-white shadow-lg shadow-indigo-600/15 hover:brightness-110 active:scale-98 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {triggerTasksGenMutation.isPending ? "Generating Tasks..." : "Generate Kanban Tasks"}
                </button>
                <div className="text-center text-slate-500 text-[10px]">
                  Analyzes acceptance criteria and creates structured task lists. Cost: Free (0 credits).
                </div>
              </div>
            )}
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
 
      {/* Edit Task Detail Modal overlay */}
      {isEditingTask && selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
              <h3 className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                Edit Task Details
              </h3>
              <button
                onClick={() => {
                  setIsEditingTask(false);
                  setSelectedTask(null);
                }}
                className="text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>
 
            <form onSubmit={handleSaveTaskDetails} className="space-y-4 font-sans">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Task Title
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none transition"
                />
              </div>
 
              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none transition resize-none"
                />
              </div>
 
              {/* Priority & Estimate */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Priority
                  </label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none transition"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="URGENT">URGENT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Estimate (mins)
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={editEstimate}
                    onChange={(e) => setEditEstimate(parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none transition"
                  />
                </div>
              </div>
 
              {/* Git Branch name */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Git Branch
                </label>
                <input
                  type="text"
                  placeholder="feat/feature-migration"
                  value={editBranch}
                  onChange={(e) => setEditBranch(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none transition"
                />
              </div>
 
              {/* Readonly Dependencies */}
              {selectedTask.dependencies && selectedTask.dependencies.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Dependencies
                  </label>
                  <div className="space-y-1 mt-1 max-h-24 overflow-y-auto">
                    {selectedTask.dependencies.map((depId) => {
                      const depTask = tasks.find((t) => t.id === depId);
                      return (
                        <div key={depId} className="text-xs text-indigo-400 flex items-center gap-1.5 pl-2 border-l border-indigo-500/40">
                          <span>🔗</span>
                          <span>{depTask ? depTask.title : `Task: ${depId}`}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
 
              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/80 font-sans">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingTask(false);
                    setSelectedTask(null);
                  }}
                  className="rounded-lg border border-slate-800 px-4 py-2 text-sm text-slate-400 hover:bg-slate-900 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateTaskMutation.isPending}
                  className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold hover:bg-indigo-500 transition disabled:opacity-50"
                >
                  {updateTaskMutation.isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
