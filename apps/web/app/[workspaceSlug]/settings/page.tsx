"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "../../../utils/trpc";

export default function WorkspaceSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.workspaceSlug as string;

  const [workspaceName, setWorkspaceName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "DEVELOPER" | "CUSTOMER">("DEVELOPER");
  const [updating, setUpdating] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const [checkoutError, setCheckoutError] = useState("");

  const {
    data: workspace,
    isLoading: loadingWorkspace,
    refetch: refetchWorkspace,
  } = trpc.workspace.getBySlug.useQuery({ slug });

  const { data: creditData, refetch: refetchCredits } = trpc.billing.getCredits.useQuery(
    { workspaceId: workspace?.id || "" },
    { enabled: !!workspace?.id }
  );

  const createSubscriptionSessionMutation = trpc.billing.createSubscriptionSession.useMutation({
    onSuccess: (session) => {
      if (session.isSimulated && session.shortUrl) {
        window.location.href = session.shortUrl;
        return;
      }

      const options = {
        key: session.keyId,
        subscription_id: session.subscriptionId,
        name: "ShipFlow AI",
        description: "Monthly subscription package upgrade",
        handler: async function (response: any) {
          refetchWorkspace();
          refetchCredits();
          alert("Upgrade completed successfully! Your subscription is now active.");
        },
        theme: {
          color: "#6366f1",
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    },
    onError: (err) => {
      setCheckoutError(err.message || "Failed to initiate payment checkout.");
    },
  });

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleUpgradePlan = async (plan: "PRO" | "ENTERPRISE") => {
    if (createSubscriptionSessionMutation.isPending || !workspace) return;
    setCheckoutError("");

    const isLoaded = await loadRazorpayScript();
    if (!isLoaded && !createSubscriptionSessionMutation.isPending) {
      if (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
        setCheckoutError("Failed to load payment checkout SDK.");
        return;
      }
    }

    createSubscriptionSessionMutation.mutate({
      workspaceId: workspace.id,
      plan,
    });
  };

  React.useEffect(() => {
    if (workspace) {
      setWorkspaceName(workspace.name);
    }
  }, [workspace]);

  // Fetch workspace members (only if workspace loaded)
  const {
    data: members,
    isLoading: loadingMembers,
    refetch: refetchMembers,
  } = trpc.workspace.listMembers.useQuery(
    { workspaceId: workspace?.id || "" },
    { enabled: !!workspace?.id }
  );

  const isOwnerOrAdmin = workspace?.role === "OWNER" || workspace?.role === "ADMIN";

  const updateWorkspaceMutation = trpc.workspace.update.useMutation({
    onSuccess: () => {
      refetchWorkspace();
      router.refresh();
    },
    onError: (err) => {
      setSettingsError(err.message || "Failed to update workspace details.");
    },
    onSettled: () => {
      setUpdating(false);
    },
  });

  const inviteMemberMutation = trpc.workspace.inviteMember.useMutation({
    onSuccess: () => {
      setInviteSuccess(true);
      setInviteEmail("");
      // Automatically hide success notification after 5s
      setTimeout(() => setInviteSuccess(false), 5000);
    },
    onError: (err) => {
      setInviteError(err.message || "Failed to send invitation.");
    },
    onSettled: () => {
      setInviting(false);
    },
  });

  const removeMemberMutation = trpc.workspace.removeMember.useMutation({
    onSuccess: () => {
      refetchMembers();
    },
    onError: (err) => {
      alert(err.message || "Failed to remove member.");
    },
  });

  const handleUpdateWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceName.trim() || !workspace) return;
    setUpdating(true);
    setSettingsError("");
    updateWorkspaceMutation.mutate({
      workspaceId: workspace.id,
      name: workspaceName,
    });
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !workspace) return;
    setInviting(true);
    setInviteError("");
    setInviteSuccess(false);
    inviteMemberMutation.mutate({
      workspaceId: workspace.id,
      email: inviteEmail,
      role: inviteRole,
    });
  };

  const handleRemoveMember = (memberId: string, name: string) => {
    if (!workspace) return;
    if (confirm(`Are you sure you want to remove ${name} from this workspace?`)) {
      removeMemberMutation.mutate({
        workspaceId: workspace.id,
        memberId,
      });
    }
  };

  if (loadingWorkspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-lg text-slate-400">Loading settings...</div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-white">
        <h1 className="text-2xl font-bold text-red-400">Workspace Not Found</h1>
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
      {/* Top Header */}
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
            Workspace Settings
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-8 py-12">
        <div className="grid gap-10 lg:grid-cols-3">
          {/* Settings Left Column */}
          <div className="lg:col-span-1 space-y-6">
            {/* General Settings */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-md">
              <h2 className="text-lg font-bold mb-4">General Settings</h2>
              {settingsError && (
                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                  {settingsError}
                </div>
              )}
              <form onSubmit={handleUpdateWorkspace} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400">
                    Workspace Name
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!isOwnerOrAdmin}
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-indigo-500 disabled:opacity-50"
                  />
                </div>
                {isOwnerOrAdmin && (
                  <button
                    type="submit"
                    disabled={updating}
                    className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition disabled:opacity-50"
                  >
                    {updating ? "Saving..." : "Save Details"}
                  </button>
                )}
              </form>
            </div>

            {/* Billing & Subscription Panel */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-md space-y-4">
              <h2 className="text-lg font-bold">Billing & Subscription</h2>
              
              {checkoutError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 font-sans">
                  {checkoutError}
                </div>
              )}

              {/* Current Subscription Tier */}
              <div className="rounded-xl bg-slate-950 p-4 border border-slate-850 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Current Plan</span>
                  <span className="font-bold text-white uppercase">{workspace?.subscription?.plan || "FREE"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Status</span>
                  <span className="font-bold text-emerald-400 uppercase">{workspace?.subscription?.status || "ACTIVE"}</span>
                </div>
                {workspace?.subscription?.currentPeriodEnd && (
                  <div className="flex justify-between text-[10px] text-slate-500 border-t border-slate-900 pt-2 mt-1">
                    <span>Renews on</span>
                    <span>{new Date(workspace.subscription.currentPeriodEnd).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              {/* Credit Balance */}
              <div className="rounded-xl bg-slate-950 p-4 border border-slate-850 flex justify-between items-center">
                <div>
                  <span className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">AI Credit Balance</span>
                  <span className="text-2xl font-extrabold text-white">{creditData?.credit?.balance ?? 50}</span>
                </div>
                <div className="text-right text-[10px] text-slate-500">
                  <span>Lifetime Allocated: </span>
                  <span className="font-mono text-slate-300 block">{creditData?.credit?.lifetimeAllocated ?? 50}</span>
                </div>
              </div>

              {/* Upgrade Trigger Options */}
              {isOwnerOrAdmin && (!workspace?.subscription || workspace?.subscription.plan === "FREE") && (
                <div className="space-y-3 pt-2">
                  <button
                    onClick={() => handleUpgradePlan("PRO")}
                    disabled={createSubscriptionSessionMutation.isPending}
                    className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-2.5 font-semibold text-xs text-white shadow-lg transition hover:brightness-110 active:scale-98 disabled:opacity-50 cursor-pointer"
                  >
                    {createSubscriptionSessionMutation.isPending ? "Connecting..." : "Upgrade to Pro ($29/mo)"}
                  </button>
                  <button
                    onClick={() => handleUpgradePlan("ENTERPRISE")}
                    disabled={createSubscriptionSessionMutation.isPending}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/40 py-2.5 font-semibold text-xs text-slate-300 hover:bg-slate-850 hover:text-white transition disabled:opacity-50 cursor-pointer"
                  >
                    Contact Enterprise Tier
                  </button>
                </div>
              )}
            </div>

            {/* Invite Member Panel */}
            {isOwnerOrAdmin && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-md">
                <h2 className="text-lg font-bold mb-4">Invite Member</h2>
                {inviteError && (
                  <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                    {inviteError}
                  </div>
                )}
                {inviteSuccess && (
                  <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                    Invitation sent successfully!
                  </div>
                )}
                <form onSubmit={handleInvite} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-indigo-500"
                      placeholder="colleague@company.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400">
                      Workspace Role
                    </label>
                    <select
                      value={inviteRole}
                      onChange={(e) =>
                        setInviteRole(e.target.value as "ADMIN" | "DEVELOPER" | "CUSTOMER")
                      }
                      className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm text-white outline-none transition focus:border-indigo-500"
                    >
                      <option value="DEVELOPER">Developer (Edit PRDs & Tasks)</option>
                      <option value="ADMIN">Admin (Manage Settings)</option>
                      <option value="CUSTOMER">Customer (Request Features)</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="w-full rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                  >
                    {inviting ? "Inviting..." : "Send Invitation"}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Members Table */}
          <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-md">
            <h2 className="text-xl font-bold mb-6">Workspace Members</h2>
            {loadingMembers ? (
              <div className="text-slate-400">Loading members...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">Role</th>
                      {isOwnerOrAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {members?.map((member) => (
                      <tr key={member.id} className="border-b border-slate-800/40 hover:bg-slate-900/20 transition-colors">
                        <td className="py-4 px-4">
                          <div>
                            <div className="font-semibold text-slate-200">
                              {member.user.name || "Unnamed User"}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {member.user.email}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              member.role === "OWNER"
                                ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/30"
                                : member.role === "ADMIN"
                                ? "bg-purple-500/10 text-purple-400 border border-purple-500/30"
                                : member.role === "DEVELOPER"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                : "bg-slate-500/10 text-slate-400 border border-slate-500/30"
                            }`}
                          >
                            {member.role}
                          </span>
                        </td>
                        {isOwnerOrAdmin && (
                          <td className="py-4 px-4 text-right">
                            {member.role !== "OWNER" && (
                              <button
                                onClick={() =>
                                  handleRemoveMember(
                                    member.id,
                                    member.user.name || member.user.email
                                  )
                                }
                                className="text-xs font-semibold text-red-500 hover:text-red-400 hover:underline transition"
                              >
                                Remove Member
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* AI Credits Ledger Logs */}
          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-md">
            <h2 className="text-xl font-bold mb-6">AI Credits Transaction History</h2>
            
            {!creditData || creditData.logs.length === 0 ? (
              <div className="text-slate-500 text-sm py-4 text-center">
                No credit transactions recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                      <th className="py-3 px-4">Action / Feature</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditData.logs.map((log: any) => (
                      <tr key={log.id} className="border-b border-slate-800/40 hover:bg-slate-900/20 transition-colors">
                        <td className="py-4 px-4 font-semibold text-slate-200 uppercase tracking-wider text-xs">
                          {log.feature.replace(/_/g, " ")}
                        </td>
                        <td className={`py-4 px-4 font-bold ${log.amount < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                          {log.amount > 0 ? `+${log.amount}` : log.amount}
                        </td>
                        <td className="py-4 px-4 text-right text-xs text-slate-500 font-mono">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
