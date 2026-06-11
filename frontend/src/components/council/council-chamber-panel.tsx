import React from "react";
import { Download, FileText, GitBranch, Scale, ShieldCheck, Users, Orbit, Sparkles, BrainCircuit, CheckCircle2, ChevronRight, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CouncillorCard } from "./councillor-card";
import { ChiefVerdictPanel } from "./chief-verdict-panel";
import { DeliberationBoard } from "./deliberation-board";
import { FloorStrategyPanel } from "./floor-strategy-panel";
import { downloadCouncilDossier } from "./council-dossier-export";
import { RETRIEVING_COUNCILLOR_IDS, type CouncilSession, type RetrievingCouncillorId } from "./council-types";
import { motion } from "framer-motion";

export function CouncilChamberPanel({ session }: { session: CouncilSession | null }) {
  if (!session) {
    return (
      <motion.section 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-[#27324a] bg-[linear-gradient(145deg,rgba(13,18,30,0.94),rgba(7,9,14,0.96))] p-8 text-foreground shadow-2xl backdrop-blur-xl dark:border-[#27324a]"
      >
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400">
            <Orbit className="h-6 w-6 animate-[spin_10s_linear_infinite]" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-500/80">System Boot</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-100">Initializing Council Chamber</h2>
          </div>
        </div>
        <p className="mt-4 text-sm text-[#7f8aa3]">Deploying 6 specialized agents for multi-domain parliamentary analysis...</p>
      </motion.section>
    );
  }

  const completedCount = RETRIEVING_COUNCILLOR_IDS.filter((id) => session.councillors[id]?.status === "complete").length;
  const status = statusCopy(session.status);
  const side = session.stance === "government" ? "Treasury Bench" : session.stance === "opposition" ? "Opposition" : "Independent brief";
  const phaseSteps = buildCouncilPhases(session.status, completedCount);
  const agreement = Math.max(0, Math.min(100, Math.round(session.agreement_score || 0)));

  return (
    <motion.section 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6" 
      data-council-chamber
    >
      {/* Premium Hero Header */}
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0c0e14] p-6 shadow-2xl md:p-8">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#3b6fd4]/10 via-transparent to-amber-500/5 mix-blend-screen" />
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#3b6fd4]/20 blur-[80px]" />
        
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1">
            <motion.div 
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
              className="flex flex-wrap items-center gap-3"
            >
              <div className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.15em] text-amber-400">
                <Sparkles className="h-3 w-3" /> Council Mode
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-[#3b6fd4]/40 bg-[#3b6fd4]/10 px-3 py-1 text-xs text-[#a9c1ff]">
                <BrainCircuit className="h-3 w-3" /> Multi-Agent Cabinet
              </div>
            </motion.div>
            
            <motion.h2 
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="mt-5 text-3xl font-bold tracking-tight text-white md:text-4xl"
            >
              Council Chamber Active
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="mt-3 max-w-2xl text-sm leading-relaxed text-[#9ba8c2] md:text-base"
            >
              Six highly specialized AI councillors are concurrently analyzing the agenda from legal, economic, strategic, social, historical, and adversarial perspectives to forge an unbreakable floor strategy.
            </motion.p>
          </div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}
            className="flex flex-col items-start gap-3 sm:items-end"
          >
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2">
              <Activity className="h-4 w-4 animate-pulse text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-300">{status}</span>
            </div>
            <Button
              type="button"
              onClick={() => downloadCouncilDossier(session)}
              disabled={session.status !== "complete"}
              className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 font-semibold text-white shadow-lg transition-all hover:scale-[1.02] hover:shadow-amber-500/25 disabled:opacity-50 disabled:hover:scale-100"
            >
              <div className="absolute inset-0 bg-white/20 opacity-0 transition-opacity group-hover:opacity-100" />
              <Download className="mr-2 h-4 w-4" />
              Download Dossier
            </Button>
          </motion.div>
        </div>

        {/* Info Strip */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="relative z-10 mt-8 grid gap-4 divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08] bg-black/40 p-1 backdrop-blur-md sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        >
          <div className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7f8aa3]">Agenda</p>
            <p className="mt-1.5 line-clamp-2 text-sm font-medium text-[#e5ebfb]">{session.topic || "Pending"}</p>
          </div>
          <div className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7f8aa3]">Role / Stance</p>
            <p className="mt-1.5 text-sm font-medium text-[#e5ebfb]">{side}</p>
          </div>
          <div className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7f8aa3]">Live Status</p>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-[#3b6fd4] shadow-[0_0_8px_rgba(59,111,212,0.8)]" />
              <p className="text-sm font-medium text-[#e5ebfb]">{completedCount}/6 Briefs Sealed</p>
            </div>
          </div>
        </motion.div>

        {/* Phase Rail */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
          <CouncilPhaseRail steps={phaseSteps} />
        </motion.div>
      </div>

      {/* Deliberation Overview */}
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <motion.div 
          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 }}
          className="relative overflow-hidden rounded-3xl border border-[#27324a] bg-gradient-to-b from-[#141a29] to-[#0c0e14] p-6 shadow-xl"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3b6fd4]/10">
              <Scale className="h-5 w-5 text-[#3b6fd4]" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100">Deliberation Engine</h3>
              <p className="text-xs text-[#7f8aa3]">Synthesizing {completedCount * 3}+ domain claims</p>
            </div>
          </div>
          
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm font-medium text-[#9ba8c2]">Council Consensus Map</p>
            <span className="font-mono text-xl font-bold text-amber-400">{agreement}%</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/[0.04]">
            <motion.div 
              initial={{ width: 0 }} animate={{ width: `${agreement}%` }} transition={{ duration: 1, delay: 0.8 }}
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500" 
            />
          </div>
          
          <div className="mt-6 grid grid-cols-2 gap-3">
             <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
               <ShieldCheck className="mx-auto h-5 w-5 text-emerald-400" />
               <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-emerald-300/70">Seals</p>
               <p className="text-lg font-bold text-emerald-100">{session.seals.length}</p>
             </div>
             <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-center">
               <GitBranch className="mx-auto h-5 w-5 text-rose-400" />
               <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-rose-300/70">Disputes</p>
               <p className="text-lg font-bold text-rose-100">{session.disputes.length}</p>
             </div>
          </div>
        </motion.div>

        {/* Dynamic Cabinet Map */}
        <motion.div 
          initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7 }}
          className="rounded-3xl border border-[#27324a] bg-gradient-to-b from-[#141a29] to-[#0c0e14] p-6 shadow-xl"
        >
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-amber-500" />
            <h3 className="font-semibold text-slate-100">Live Cabinet Activity</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { id: "C1_LEGAL", label: "Legal", desc: "Treaties & Doctrine", icon: "⚖️" },
              { id: "C2_ECONOMIC", label: "Economic", desc: "Fiscal Tradeoffs", icon: "📈" },
              { id: "C3_STRATEGIC", label: "Strategic", desc: "Geopolitics", icon: "♟️" },
              { id: "C4_SOCIAL", label: "Social", desc: "Demographics", icon: "👥" },
              { id: "C5_HISTORICAL", label: "Historical", desc: "Precedents", icon: "🏛️" },
              { id: "C6_OPPOSITION", label: "Opposition", desc: "Adversarial Stress", icon: "🔥" },
            ].map((c) => {
              const councillorId = c.id as RetrievingCouncillorId;
              const councillor = session.councillors[councillorId];
              const isActive = councillor?.status === "complete" || councillor?.status === "running";
              const isComplete = councillor?.status === "complete";
              return (
                <div key={c.label} className={`relative overflow-hidden rounded-xl border p-3 transition-all duration-300 ${isActive ? 'border-[#3b6fd4]/30 bg-[#3b6fd4]/5' : 'border-white/[0.04] bg-white/[0.02]'}`}>
                  <div className="flex items-start justify-between">
                    <span className="text-lg opacity-80">{c.icon}</span>
                    {isComplete && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
                    {!isComplete && isActive && <span className="flex h-2 w-2 rounded-full bg-[#3b6fd4] shadow-[0_0_8px_rgba(59,111,212,0.8)] animate-ping" />}
                  </div>
                  <p className={`mt-2 text-xs font-bold ${isActive ? 'text-slate-200' : 'text-[#7f8aa3]'}`}>{c.label}</p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-wider text-[#7f8aa3]">{c.desc}</p>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Individual Councillor Outputs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {RETRIEVING_COUNCILLOR_IDS.map((id, idx) => (
          <motion.div key={id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 + (idx * 0.1) }}>
            <CouncillorCard councillorId={id} output={session.councillors[id]} />
          </motion.div>
        ))}
      </div>
      
      {/* Deliberation Board */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4 }}>
        <DeliberationBoard seals={session.seals} disputes={session.disputes} agreementScore={session.agreement_score} />
      </motion.div>

      {/* Floor Strategy and Verdict */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5 }}>
         <FloorStrategyPanel verdict={session.verdict} />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.6 }}>
         <ChiefVerdictPanel verdict={session.verdict} stream={session.chief_verdict_stream} />
      </motion.div>

    </motion.section>
  );
}

function CouncilPhaseRail({ steps }: { steps: Array<{ label: string; description: string; state: "done" | "active" | "pending" }> }) {
  return (
    <div className="relative mt-8">
      <div className="absolute left-0 top-6 h-0.5 w-full bg-white/[0.04]" />
      <div className="relative grid grid-cols-4 gap-4">
        {steps.map((step, index) => (
          <div key={step.label} className="relative z-10 flex flex-col items-center text-center">
            <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border-2 transition-all duration-500 shadow-xl ${
              step.state === "done" ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" :
              step.state === "active" ? "border-[#3b6fd4] bg-[#3b6fd4]/20 text-[#3b6fd4] shadow-[0_0_20px_rgba(59,111,212,0.4)]" :
              "border-white/10 bg-black/50 text-[#7f8aa3]"
            }`}>
              {step.state === "done" ? <CheckCircle2 className="h-5 w-5" /> : <span className="text-sm font-bold">{index + 1}</span>}
            </div>
            <p className={`text-xs font-bold uppercase tracking-widest ${step.state === "active" ? "text-slate-200" : "text-[#7f8aa3]"}`}>{step.label}</p>
            <p className="mt-1 hidden text-[10px] text-[#7f8aa3] sm:block">{step.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildCouncilPhases(status: CouncilSession["status"], completedCount: number) {
  const order: CouncilSession["status"][] = ["expanding", "retrieving", "briefing", "deliberating", "synthesizing", "complete"];
  const activeIndex = Math.max(0, order.indexOf(status));
  return [
    { label: "Assign", description: "Orchestrating agents", state: activeIndex > 0 || completedCount > 0 ? "done" : "active" },
    { label: "Retrieve", description: "Parallel domain research", state: completedCount === 6 || activeIndex > 2 ? "done" : activeIndex >= 1 ? "active" : "pending" },
    { label: "Deliberate", description: "Mathematical clash mapping", state: activeIndex > 3 ? "done" : activeIndex === 3 ? "active" : "pending" },
    { label: "Verdict", description: "Synthesizing floor strategy", state: status === "complete" ? "done" : activeIndex >= 4 ? "active" : "pending" },
  ] as Array<{ label: string; description: string; state: "done" | "active" | "pending" }>;
}

function statusCopy(status: CouncilSession["status"]): string {
  if (status === "briefing") return "Agents Retrieving & Briefing";
  if (status === "deliberating") return "Deliberation Engine Running";
  if (status === "synthesizing") return "Chief Strategy Synthesizing";
  if (status === "complete") return "Council Chamber Concluded";
  return "Council Initializing";
}
