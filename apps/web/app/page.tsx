import { Button } from "@repo/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-slate-50 font-sans p-6">
      <main className="flex flex-col items-center gap-8 max-w-2xl text-center">
        <div className="rounded-full bg-indigo-500/10 px-4 py-1.5 text-sm font-semibold text-indigo-400 ring-1 ring-inset ring-indigo-500/20">
          ShipFlow AI Milestone 1 Active
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          ShipFlow AI
        </h1>
        <p className="text-lg text-slate-400">
          The collaborative AI-driven agent framework for managing the complete software delivery lifecycle.
        </p>
        <div className="flex gap-4">
          <Button appName="web" className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
            Open Sandbox
          </Button>
          <a
            href="/docs"
            className="rounded-lg border border-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-900"
          >
            Read Docs
          </a>
        </div>
      </main>
    </div>
  );
}
