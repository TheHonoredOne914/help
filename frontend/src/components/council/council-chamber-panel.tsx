import React from "react";
import { Download, GitBranch, Scale, ShieldCheck, Users, BrainCircuit, CheckCircle2, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CouncillorCard } from "./councillor-card";
import { ChiefVerdictPanel } from "./chief-verdict-panel";
import { DeliberationBoard } from "./deliberation-board";
import { FloorStrategyPanel } from "./floor-strategy-panel";
import { downloadCouncilDossier } from "./council-dossier-export";
import { RETRIEVING_COUNCILLOR_IDS, type CouncilSession, type RetrievingCouncillorId } from "./council-types";
import { motion, useReducedMotion } from "framer-motion";

function useCouncilMotion() {
  const reduce = useReducedMotion();
  if (reduce) {
    return {
      reduce: true as const,
      Section: "section" as const,
      Div: "div" as const,
      H2: "h2" as const,
      P: "p" as const,
      motionProps: () => ({}),
    };
  }
  return {
    reduce: false as const,
    Section: motion.section,
    Div: motion.div,
    H2: motion.h2,
    P: motion.p,
    motionProps: (props: Record<string, unknown>) => props,
  };
}

export function CouncilChamberPanel({ session }: { session: CouncilSession | null }) {
  const { Section, Div, H2, P, motionProps, reduce } = useCouncilMotion();

  if (!session) {
    return null;
  }

  const completedCount = RETRIEVING_COUNCILLOR_IDS.filter((id) => session.councillors[id]?.status === "complete").length;
  const status = statusCopy(session.status);
  const side = session.stance === "government" ? "Treasury Bench" : session.stance === "opposition" ? "Opposition" : "Independent brief";
  const phaseSteps = buildCouncilPhases(session.status, completedCount);
  const agreement = Math.max(0, Math.min(100, Math.round(session.agreement_score || 0)));

  return (
    <Section
      {...motionProps({ initial: { opacity: 0 }, animate: { opacity: 1 } })}
      className="space-y-6"
      data-council-chamber
    >
      {/* Premium Hero Header */}
      <div className="relative overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6 md:p-8">
        
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1">
            <Div
              {...motionProps({ initial: { opacity: 0, x: -10 }, animate: { opacity: 1, x: 0 }, transition: { delay: 0.1 } })}
              className="flex flex-wrap items-center gap-3"
            >
              <div className="flex items-center gap-1.5 rounded-sm border border-[var(--accent-secondary-border)] bg-[var(--accent-secondary-subtle)] px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--brass)]">
                <Scale className="h-3 w-3" /> Council Mode
              </div>
              <div className="flex items-center gap-1.5 rounded-sm border border-[color-mix(in_srgb,var(--navy)_40%,transparent)] bg-[color-mix(in_srgb,var(--navy)_10%,transparent)] px-3 py-1 text-xs text-[var(--navy)]">
                <BrainCircuit className="h-3 w-3" /> Multi-Agent Cabinet
              </div>
            </Div>
            
            <H2
              {...motionProps({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.2 } })}
              className="mt-5 font-serif text-3xl font-normal tracking-tight text-[var(--ink)] md:text-4xl"
            >
              Council Chamber Active
            </H2>
            <P
              {...motionProps({ initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay: 0.3 } })}
              className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--slate)] md:text-base"
            >
              Six highly specialized AI councillors are concurrently analyzing the agenda from legal, economic, strategic, social, historical, and adversarial perspectives to forge an unbreakable floor strategy.
            </P>
          </div>

          <Div
            {...motionProps({ initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 }, transition: { delay: 0.2 } })}
            className="flex flex-col items-start gap-3 sm:items-end"
          >
            <div className="flex items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--status-success)_30%,transparent)] bg-[color-mix(in_srgb,var(--status-success)_10%,transparent)] px-4 py-2">
              <Activity className="h-4 w-4 animate-pulse text-[var(--status-success)]" />
              <span className="text-sm font-semibold text-[var(--status-success)]">{status}</span>
            </div>
            <Button
              type="button"
              onClick={() => downloadCouncilDossier(session)}
              disabled={session.status !== "complete"}
              className="relative overflow-hidden rounded-xl bg-[var(--brass)] px-6 font-semibold text-[var(--ink)] shadow-sm transition-colors hover:bg-[color-mix(in_srgb,var(--brass)_88%,white)] disabled:opacity-50"
            >
              <Download className="mr-2 h-4 w-4" />
              Download Dossier
            </Button>
          </Div>
        </div>

        {/* Info Strip */}
        <Div
          {...motionProps({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.4 } })}
          className="relative z-10 mt-8 grid gap-4 divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-1 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        >
          <div className="p-4">
            <p className="text-2xs font-bold uppercase tracking-[0.15em] text-[var(--slate)]">Agenda</p>
            <p className="mt-1.5 line-clamp-2 text-sm font-medium text-[var(--ink)]">{session.topic || "Pending"}</p>
          </div>
          <div className="p-4">
            <p className="text-2xs font-bold uppercase tracking-[0.15em] text-[var(--slate)]">Role / Stance</p>
            <p className="mt-1.5 text-sm font-medium text-[var(--ink)]">{side}</p>
          </div>
          <div className="p-4">
            <p className="text-2xs font-bold uppercase tracking-[0.15em] text-[var(--slate)]">Live Status</p>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-[var(--navy)]" />
              <p className="text-sm font-medium text-[var(--ink)]">{completedCount}/6 Briefs Sealed</p>
            </div>
          </div>
        </Div>

        {/* Phase Rail */}
        <Div {...motionProps({ initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay: 0.5 } })}>
          <CouncilPhaseRail steps={phaseSteps} />
        </Div>
      </div>

      {/* Deliberation Overview */}
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Div
          {...motionProps({ initial: { opacity: 0, x: -10 }, animate: { opacity: 1, x: 0 }, transition: { delay: 0.6 } })}
          className="relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--navy)_10%,transparent)]">
              <Scale className="h-5 w-5 text-[var(--navy)]" />
            </div>
            <div>
              <h3 className="font-semibold text-[var(--ink)]">Deliberation Engine</h3>
              <p className="text-xs text-[var(--slate)]">Synthesizing {completedCount * 3}+ domain claims</p>
            </div>
          </div>
          
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm font-medium text-[var(--slate)]">Council Consensus Map</p>
            <span className="font-mono text-xl font-bold text-[var(--navy)]">{agreement}%</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
            {reduce ? (
              <div className="h-full rounded-full bg-[var(--navy)]" style={{ width: `${agreement}%` }} />
            ) : (
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${agreement}%` }}
                transition={{ duration: 1, delay: 0.8 }}
                className="h-full rounded-full bg-[var(--navy)]"
              />
            )}
          </div>
          
          <div className="mt-6 grid grid-cols-2 gap-3">
             <div className="rounded-xl border border-[color-mix(in_srgb,var(--status-success)_25%,transparent)] bg-[color-mix(in_srgb,var(--status-success)_8%,transparent)] p-3 text-center">
                <ShieldCheck className="mx-auto h-5 w-5 text-[var(--status-success)]" />
                <p className="mt-2 text-2xs font-bold uppercase tracking-wider text-[var(--status-success)]">Seals</p>
                <p className="text-lg font-bold text-[var(--ink)]">{session.seals.length}</p>
             </div>
             <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-center">
                <GitBranch className="mx-auto h-5 w-5 text-destructive" />
                <p className="mt-2 text-2xs font-bold uppercase tracking-wider text-destructive">Disputes</p>
                <p className="text-lg font-bold text-[var(--ink)]">{session.disputes.length}</p>
             </div>
          </div>
        </Div>

        {/* Dynamic Cabinet Map */}
        <Div
          {...motionProps({ initial: { opacity: 0, x: 10 }, animate: { opacity: 1, x: 0 }, transition: { delay: 0.7 } })}
          className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-[var(--brass)]" />
            <h3 className="font-semibold text-[var(--ink)]">Live Cabinet Activity</h3>
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
                <div key={c.label} className={`relative overflow-hidden rounded-xl border p-3 transition-all duration-300 ${isActive ? 'border-[color-mix(in_srgb,var(--navy)_30%,transparent)] bg-[color-mix(in_srgb,var(--navy)_6%,transparent)]' : 'border-[var(--line)] bg-transparent'}`}>
                  <div className="flex items-start justify-between">
                    <span className="text-lg opacity-80">{c.icon}</span>
                    {isComplete && <CheckCircle2 className="h-3 w-3 text-[var(--status-success)]" />}
                    {!isComplete && isActive && <span className="flex h-2 w-2 rounded-full bg-[var(--navy)] animate-pulse" />}
                  </div>
                  <p className={`mt-2 text-xs font-bold ${isActive ? 'text-[var(--ink)]' : 'text-[var(--slate)]'}`}>{c.label}</p>
                  <p className="mt-0.5 text-2xs uppercase tracking-wider text-[var(--slate)]">{c.desc}</p>
                </div>
              );
            })}
          </div>
        </Div>
      </div>

      {/* Individual Councillor Outputs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {RETRIEVING_COUNCILLOR_IDS.map((id, idx) => (
          <Div key={id} {...motionProps({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.8 + (idx * 0.1) } })}>
            <CouncillorCard councillorId={id} output={session.councillors[id]} />
          </Div>
        ))}
      </div>
      
      {/* Deliberation Board */}
      <Div {...motionProps({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay: 1.4 } })}>
        <DeliberationBoard seals={session.seals} disputes={session.disputes} agreementScore={session.agreement_score} />
      </Div>

      {/* Floor Strategy and Verdict */}
      <Div {...motionProps({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay: 1.5 } })}>
         <FloorStrategyPanel verdict={session.verdict} />
      </Div>
      <Div {...motionProps({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay: 1.6 } })}>
         <ChiefVerdictPanel verdict={session.verdict} stream={session.chief_verdict_stream} />
      </Div>

    </Section>
  );
}

function CouncilPhaseRail({ steps }: { steps: Array<{ label: string; description: string; state: "done" | "active" | "pending" }> }) {
  return (
    <div className="relative mt-8">
      <div className="absolute left-0 top-6 h-0.5 w-full bg-[var(--surface-muted)]" />
      <div className="relative grid grid-cols-4 gap-4">
        {steps.map((step, index) => (
          <div key={step.label} className="relative z-10 flex flex-col items-center text-center">
            <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl border-2 transition-all duration-500 shadow-sm ${
              step.state === "done" ? "border-[var(--status-success)] bg-[color-mix(in_srgb,var(--status-success)_15%,transparent)] text-[var(--status-success)]" :
              step.state === "active" ? "border-[var(--navy)] bg-[color-mix(in_srgb,var(--navy)_20%,transparent)] text-[var(--navy)]" :
              "border-[var(--line)] bg-[var(--surface-muted)] text-[var(--slate)]"
            }`}>
              {step.state === "done" ? <CheckCircle2 className="h-5 w-5" /> : <span className="text-sm font-bold">{index + 1}</span>}
            </div>
            <p className={`text-xs font-bold uppercase tracking-widest ${step.state === "active" ? "text-[var(--ink)]" : "text-[var(--slate)]"}`}>{step.label}</p>
            <p className="mt-1 hidden text-2xs text-[var(--slate)] sm:block">{step.description}</p>
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
