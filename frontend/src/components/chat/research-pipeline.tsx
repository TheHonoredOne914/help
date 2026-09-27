import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Globe, ChevronDown, AlertCircle, Download, Loader2,
  Scale, BarChart2, FileText, Newspaper, ChevronUp, Clipboard, ClipboardCheck,
} from "lucide-react";
import type {
  BatchState,
  CorePipelineEventSummary,
  CoreQualityGateStatus,
  CitationStatusSummary,
  DataCheatsheet,
  DimensionScore,
  EvidenceRegistrySummary,
  FullSourceManifestSummary,
  ModelDraftStatus,
  PlannerRoles,
  ArchiveRoutingStatus,
  ResearchAngleStatus,
  ResearchModeStatus,
  SourceContractStatus,
  SourceGapReportSummary,
} from "@/hooks/use-pipeline-state";
import { cn } from "@/lib/utils";
import { QwenThinking } from "./qwen-thinking";
import { StreamingText } from "./streaming-text";
import { DimensionDisplay } from "./dimension-display";
import { cleanMessageContent, prepareMessageForCopy } from "./citation-parts";
import { ResearchAnswerBody } from "./research-answer-body";
import { ThoughtBlock, extractThinking } from "./thought-block";
import {
  getStatusSemantics,
  PromptBudgetPanel,
  ProviderRuntimePanel,
  QualityGatePanel,
  SourceContractPanel,
  SourceListPanel,
  StatusBadge,
  type PromptBudgetReportSummary,
} from "./research-pipeline/index";
import type { LivePanelId } from "@/lib/research-mode-ui";
import { getResearchPersona } from "@/lib/research-personas";
import { providerBgClass } from "@/lib/provider-colors";
import {
  classifySourceBucket,
  getSourceBadge,
  isCourtSource,
} from "@/lib/source-semantics";
import { hostFromUrl } from "@/lib/host-from-url";

export interface VerificationResult {
  verified: boolean;
  confidence: number;
  notes: string;
  thinking: string[];
  sources: { title: string; url: string }[];
  model: string;
  modelFull: string;
}

interface FoundResult {
  title: string;
  url: string;
  engine?: string;
  sourceType?: string;
}

export interface ExhaustedState {
  reason: "rate_limit" | "error";
}

export type ModelConfig = "standard" | "opus" | "intensive" | "custom";

interface ResearchPipelineProps {
  mode: "normal" | ResearchModeStatus;
  modelConfig: ModelConfig;
  isPlanning?: boolean;
  plannerModel?: string | null;
  plannerRoles?: PlannerRoles | null;
  isSynthesizing: boolean;
  isVerifying: boolean;
  verification: VerificationResult | null;
  isComplete: boolean;
  qwenThinking: string[];
  qwenThinkingStream?: string;
  isDiscussing?: boolean;
  discussion?: string | null;
  bothExhausted: boolean;
  selectedModels?: string[];
  customModelSearches?: Record<string, string[]>;
  customModelFound?: Record<string, FoundResult[]>;
  customModelExhausted?: Record<string, ExhaustedState | null>;
  modelDraftStatus?: Record<string, ModelDraftStatus>;
  queriesPlannedByModel?: Record<string, number>;
  researchPlan?: string[];
  fetchingTotal?: number;
  fetchedCount?: number;
  citationWarning?: boolean;
  topicStrategy?: { topicClass: string; sourcePriorities: string[]; mustIncludeDomains: string[] } | null;
  isGeminiSynthesizing?: boolean;
  citationCoverage?: { coveragePct: number; missingIds: number[]; eligibleIds: number[] } | null;
  query?: string;
  streamingAnswer?: string;
  finalAnswer?: string;
  citedNums?: Set<number>;
  batches?: Record<string, BatchState>;
  dataCheatsheet?: DataCheatsheet | null;
  dimensionScores?: DimensionScore[] | null;
  activeDivisions?: string[];
  completedDivisions?: Array<{ id: string; wordCount: number; citationCount: number }>;
  agendaClass?: string | null;
  committeeType?: string | null;
  evidenceSummary?: EvidenceRegistrySummary | null;
  fullSourceManifest?: FullSourceManifestSummary | null;
  citationStatus?: CitationStatusSummary | null;
  corePipelineEvents?: CorePipelineEventSummary[];
  sourceContract?: SourceContractStatus | null;
  sourceGapReport?: SourceGapReportSummary | null;
  coreQualityGate?: CoreQualityGateStatus | null;
  selectedResearchMode?: ResearchModeStatus | null;
  archiveRouting?: ArchiveRoutingStatus | null;
  researchAngles?: ResearchAngleStatus[];
  legacyFallbackUsed?: boolean;
  searchTier?: string;
  runStatus?: "idle" | "running" | "repairing" | "completed" | "completed_with_source_gaps" | "degraded_fallback" | "failed" | "cancelled" | "provider_error" | "legacy_fallback_used";
  allowedPanels?: readonly LivePanelId[];
}

const classifySource = classifySourceBucket;

const DIVISION_NAMES = [
  ["core_brief", "Core Brief"],
  ["analytical_dimensions", "Analytical Dimensions"],
  ["stakeholder_mapping", "Stakeholders"],
  ["conflict_mapping", "Conflict Mapping"],
  ["narrative_analysis", "Narratives"],
  ["evidence_verification", "Evidence"],
  ["debate_utility", "Debate Arsenal"],
  ["policy_pathways", "Policy Pathways"],
  ["predictive_analysis", "Predictive Analysis"],
  ["resolution_support", "Resolution Support"],
  ["strategic_insights", "Strategic Insights"],
] as const;

function DivisionProgressTracker({
  activeDivisions = [],
  completedDivisions = [],
}: {
  activeDivisions?: string[];
  completedDivisions?: Array<{ id: string; wordCount: number; citationCount: number }>;
}) {
  if (activeDivisions.length === 0 && completedDivisions.length === 0) return null;
  const completed = new Map(completedDivisions.map((division) => [division.id, division]));

  return (
    <section className="mx-4 mb-3 rounded-xl border border-slate-300/40 bg-[var(--surface)]/95 p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[var(--ink)]">Division Progress</p>
        <span className="font-mono text-2xs text-[var(--slate)]">{completed.size}/11 complete</span>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {DIVISION_NAMES.map(([id, label], index) => {
          const done = completed.get(id);
          const active = activeDivisions.includes(id);
          return (
            <div
              key={id}
              className={cn(
                "flex min-h-9 items-center justify-between gap-2 rounded-lg border px-2 py-1.5",
                done
                  ? "border-green-500/30 bg-green-500/10"
                  : active
                    ? "border-[var(--navy)]/40 bg-[var(--navy)]/10"
                    : "border-slate-300/30 bg-slate-500/5"
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-[var(--ink)]">{index + 1}. {label}</p>
                {done ? (
                  <p className="text-2xs text-[var(--slate)]">{done.wordCount} words, {done.citationCount} cites</p>
                ) : (
                  <p className="text-2xs text-[var(--slate)]">{active ? "Generating" : "Pending"}</p>
                )}
              </div>
              {active && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--navy)]" />}
              {done && <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function modelMetaFromKey(key: string): { label: string; color: string } {
  const displayKey = key.replace(/^(groq|nvidia|ollama|gemini|openrouter)\//, "");
  const parts = displayKey.replace(/[-_]/g, " ").split(" ");
  const skipWords = new Set(["instruct", "versatile", "preview", "latest", "distill", "it"]);
  const shortParts = parts.filter(p => !skipWords.has(p.toLowerCase())).slice(0, 3);
  const label = shortParts.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(" ");
  return { label, color: providerBgClass(key) };
}

// ── Data Snapshot ─────────────────────────────────────────────────────────────
interface SnapshotData {
  govCount: number;
  courtCount: number;
  intlCount: number;
  mediaCount: number;
  academicCount: number;
  total: number;
}

function buildSnapshot(
  selectedModels: string[],
  customModelFound: Record<string, FoundResult[]>
): SnapshotData {
  const selected = selectedModels.flatMap(k => customModelFound[k] ?? []);
  const all = selected.length > 0 ? selected : Object.values(customModelFound).flat();
  const seen = new Set<string>();
  const dedup = all.filter(s => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
  const govCount   = dedup.filter(s => classifySource(s) === "gov").length;
  const courtCount = dedup.filter(s => classifySource(s) === "court").length;
  const intlCount  = dedup.filter(s => classifySource(s) === "intl").length;
  const mediaCount = dedup.filter(s => classifySource(s) === "media").length;
  const academicCount = dedup.filter(s => classifySource(s) === "academic").length;
  return { govCount, courtCount, intlCount, mediaCount, academicCount, total: dedup.length };
}

function dedupeSourceResults<T extends { url: string }>(sources: T[]): T[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (!source.url || seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

function collectPromptBudgetReports(events: CorePipelineEventSummary[]): PromptBudgetReportSummary[] {
  const reports: PromptBudgetReportSummary[] = [];
  for (const event of events) {
    const single = event.data?.promptBudgetReport;
    const many = event.data?.promptBudgetReports;
    if (single && typeof single === "object") reports.push(single as PromptBudgetReportSummary);
    if (Array.isArray(many)) {
      reports.push(...many.filter((item): item is PromptBudgetReportSummary => Boolean(item) && typeof item === "object"));
    }
  }
  return reports;
}

// ── User-facing pipeline event filter ───────────────────────────────────────
// Only show events that are meaningful to end-users. Hide all internal
// implementation details like cache mechanics, cooldowns, and technical checks.
const USER_FACING_EVENT_TYPES = new Set([
  // Planning & Strategy
  "request_received",
  "agenda_contract_created",
  "archive_safety_checked",
  "source_bucket_plan_created",
  "research_angles_generated",
  "archive_routing_completed",
  // Source Discovery Progress
  "bucket_search_started",
  "bucket_search_completed",
  "source_dedup_completed",
  "source_filter_completed",
  "source_scoring_completed",
  "source_enrichment_started",
  "source_enrichment_completed",
  // Evidence & Citation
  "evidence_registry_created",
  "evidence_pack_created",
  "citation_audit_started",
  "hallucination_audit_started",
  // Model Progress
  "model_role_started",
  "model_role_completed",
  "source_usage_started",
  "source_usage_completed",
  "dimension_engine_completed",
  "division_outputs_ready",
  // Quality & Completion
  "quality_gate_completed",
  "synthesis_started",
  "final_answer_ready",
  "completed",
  "completed_with_source_gaps",
  // Errors (user should see these)
  "pipeline_failed",
  "failed",
  "cancelled",
  "provider_error",
]);

function isUserFacingEvent(eventType: string): boolean {
  return USER_FACING_EVENT_TYPES.has(eventType);
}

function pipelineCheckClass(type: string): string {
  if (type.includes("failed") || type.includes("error") || type.includes("invalidate") || type.includes("schema_mismatch")) {
    return "text-red-700 dark:text-red-300";
  }
  if (type.includes("negative") || type.includes("warning") || type.includes("cooldown") || type.includes("stale")) {
    return "text-amber-700 dark:text-amber-300";
  }
  if (type.includes("cache_hit") || type === "completed") {
    return "text-emerald-700 dark:text-emerald-300";
  }
  return "text-[var(--slate)]";
}

function pipelineCheckDotClass(type: string): string {
  if (type.includes("failed") || type.includes("error") || type.includes("invalidate") || type.includes("schema_mismatch")) {
    return "bg-red-500";
  }
  if (type.includes("negative") || type.includes("warning") || type.includes("cooldown") || type.includes("stale")) {
    return "bg-[color-mix(in_srgb,var(--brass)_8%,transparent)]";
  }
  if (type.includes("cache_hit") || type === "completed") {
    return "bg-emerald-500";
  }
  return "bg-slate-400";
}

function DataSnapshot({ snapshot }: { snapshot: SnapshotData }) {
  const [open, setOpen] = useState(false);
  const { govCount, courtCount, intlCount, mediaCount, academicCount, total } = snapshot;

  return (
    <div className="mx-4 mb-3 overflow-hidden rounded-xl border border-[var(--navy)]/30 bg-[var(--surface)]/90">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-[var(--surface-muted)]/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BarChart2 className="w-3.5 h-3.5 text-[var(--navy)]" />
          <span className="text-xs font-semibold text-[var(--slate)]">
            Research Snapshot · {total} sources indexed
          </span>
        </div>
        {open
          ? <ChevronUp className="w-3.5 h-3.5 text-[var(--slate)]" />
          : <ChevronDown className="w-3.5 h-3.5 text-[var(--slate)]" />}
      </button>
      {open && (
        <div className="px-3.5 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          {[
            { label: "Gov Sources", count: govCount, cls: "bg-slate-50 dark:bg-slate-900/40 border-slate-200/50 text-[var(--slate)] dark:text-slate-300" },
            { label: "Court Cases", count: courtCount, cls: "bg-[color-mix(in_srgb,var(--brass)_8%,transparent)] dark:bg-[var(--brass)]/12 border-[color-mix(in_srgb,var(--brass)_30%,transparent)] dark:border-[var(--brass)]/30 text-amber-700 dark:text-amber-400" },
            { label: "Intl Bodies", count: intlCount, cls: "bg-slate-50 dark:bg-slate-800/40 border-slate-200/50 text-[var(--slate)] dark:text-slate-300" },
            { label: "Media/Other", count: mediaCount, cls: "bg-slate-50 dark:bg-slate-900/40 border-slate-200/50 text-[var(--slate)] dark:text-slate-300" },
            { label: "Academic", count: academicCount, cls: "bg-slate-50 dark:bg-slate-900/40 border-slate-200/50 text-[var(--slate)] dark:text-slate-300" },
          ].map(({ label, count, cls }) => (
            <div key={label} className={cn("rounded-lg border p-2.5", cls)}>
              <div className="text-lg font-bold leading-tight">{count}</div>
              <div className="text-2xs font-medium opacity-80">{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceMixChart({ snapshot }: { snapshot: SnapshotData }) {
  const rows = [
    { label: "Gov", count: snapshot.govCount, className: "bg-slate-600 dark:bg-slate-300" },
    { label: "Court", count: snapshot.courtCount, className: "bg-[color-mix(in_srgb,var(--brass)_8%,transparent)]" },
    { label: "Intl", count: snapshot.intlCount, className: "bg-[var(--navy)]" },
    { label: "Media", count: snapshot.mediaCount, className: "bg-emerald-500" },
    { label: "Acad", count: snapshot.academicCount, className: "bg-sky-600" },
  ];
  const max = Math.max(...rows.map((row) => row.count), 1);

  return (
    <div className="mb-3 rounded-xl border border-[var(--line)]/50 bg-[var(--surface)]/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-2xs font-bold uppercase tracking-[0.14em] text-[var(--slate)]">Source Graph</span>
        <span className="rounded-full bg-[var(--navy)]/10 px-2 py-0.5 text-2xs font-semibold text-[var(--navy)]">
          {snapshot.total} indexed
        </span>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[42px_minmax(0,1fr)_24px] items-center gap-2">
            <span className="text-2xs font-semibold text-[var(--slate)]">{row.label}</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
              <div
                className={cn("h-full rounded-full transition-[width] duration-700 ease-out", row.className)}
                style={{ width: row.count > 0 ? `${Math.max(4, (row.count / max) * 100)}%` : "0%" }}
              />
            </div>
            <span className="text-right text-2xs font-bold text-[var(--ink)]/80">{row.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const ROLE_META = [
  { key: "data_analyst",     label: "Data Analyst",     abbr: "DA", color: "text-[var(--navy)]", bg: "bg-[var(--navy)]/8 border-[var(--navy)]/20" },
  { key: "legal_researcher", label: "Legal Researcher", abbr: "LR", color: "text-[var(--navy)]",   bg: "bg-[var(--navy)]/8 border-[color-mix(in_srgb,var(--navy)_20%,transparent)]" },
  { key: "policy_analyst",   label: "Policy Analyst",   abbr: "PA", color: "text-slate-400",  bg: "bg-slate-500/8 border-slate-400/20" },
  { key: "current_affairs",  label: "Current Affairs",  abbr: "CA", color: "text-slate-400", bg: "bg-slate-500/8 border-slate-400/20" },
  { key: "media_journalist", label: "Media & Civil Society", abbr: "MJ", color: "text-rose-400", bg: "bg-rose-500/8 border-rose-400/20" },
] as const;

function QueryPlannerCard({
  isPlanning,
  plannerModel,
  plannerRoles,
  searchTier,
}: {
  isPlanning: boolean;
  plannerModel?: string | null;
  plannerRoles?: PlannerRoles | null;
  searchTier?: string;
}) {
  const hasRoles = plannerRoles && Object.values(plannerRoles).some(arr => arr.length > 0);
  if (!isPlanning && !hasRoles) return null;

  const plannerLabel = plannerModel
    ? plannerModel.replace(/^(groq|nvidia|ollama|gemini|openrouter)\//, "").split("-").slice(0, 2).join(" ")
    : "Planner";
  const plannedCount = Object.values(plannerRoles ?? {}).flat().length;

  return (
    <div className="mx-4 mb-3 overflow-hidden rounded-xl border border-[var(--navy)]/25 bg-[var(--surface)]/90 shadow-sm">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--line)]/40">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--navy)]/30 bg-[var(--navy)]/15">
          {isPlanning && !hasRoles
            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--navy)]" />
            : <Loader2 className="h-3.5 w-3.5 text-[var(--navy)] animate-spin" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[var(--ink)] leading-tight">Query Planner</p>
          <p className="text-2xs text-[var(--slate)] leading-tight mt-0.5">
            {isPlanning && !hasRoles
              ? `${plannerLabel} is mapping the search strategy...`
              : `${plannerLabel} planned ${plannedCount} queries across 4 research roles`}
          </p>
        </div>
        {searchTier && (
          <span className="rounded-full border border-[var(--line)]/60 bg-[var(--surface-muted)]/70 px-2 py-0.5 font-mono text-2xs text-[var(--slate)] dark:border-[var(--line)] dark:bg-[var(--surface)] dark:text-[var(--slate)]">
            {searchTier}
          </span>
        )}
      </div>

      {hasRoles && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border/30">
          {ROLE_META.map(({ key, label, abbr, color, bg }) => {
            const queries = plannerRoles?.[key] ?? [];
            if (!queries.length) return null;
            return (
              <div key={key} className="bg-[var(--paper)] px-3.5 py-2.5 space-y-1.5">
                <div className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-2xs font-bold tracking-wide uppercase", bg, color)}>
                  <span>{abbr}</span>
                  <span className="font-medium normal-case tracking-normal opacity-80">{label}</span>
                </div>
                <ul className="space-y-1">
                  {queries.map((q, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-2xs text-[var(--slate)] font-mono shrink-0 mt-0.5">{i + 1}.</span>
                      <span className="text-xs text-[var(--ink)]/80 leading-relaxed">{q}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {isPlanning && !hasRoles && (
        <div className="px-4 py-3 grid grid-cols-2 gap-2">
          {ROLE_META.map(({ key, bg, color }) => (
            <div key={key} className={cn("rounded-lg border p-2.5 space-y-1.5", bg)}>
              <div className={cn("h-3 w-16 rounded bg-current opacity-20 animate-pulse", color)} />
              <div className="h-2 w-full rounded bg-[var(--surface-muted)]/50 animate-pulse" />
              <div className="h-2 w-4/5 rounded bg-[var(--surface-muted)]/50 animate-pulse" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PhasePill({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium transition-all",
      done   ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-500" :
      active ? "border-[var(--navy)]/30 bg-[var(--navy)]/10 text-[var(--navy)] animate-pulse" :
               "border-[var(--line)]/30 bg-[var(--surface-muted)]/30 text-[var(--slate)]/50"
    )}>
      {done ? "✓" : active ? "●" : "○"}
      {label}
    </span>
  );
}

// ── Grouped Sources Panel ─────────────────────────────────────────────────────
function GroupedSources({ sources }: { sources: FoundResult[] }) {
  const [open, setOpen] = useState(false);

  const { dedup, groups } = useMemo(() => {
    const seen = new Set<string>();
    const d = sources.filter(s => {
      if (seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    });

    const gov = d.filter(s => classifySource(s) === "gov");
    const court = d.filter(s => classifySource(s) === "court");
    const intl = d.filter(s => classifySource(s) === "intl");
    const media = d.filter(s => classifySource(s) === "media");

    const g = [
      { label: "Indian Government Sources", items: gov },
      { label: "Court Judgements", items: court },
      { label: "International Institutions", items: intl },
      { label: "Media & Research", items: media },
    ].filter(g => g.items.length > 0);

    return { dedup: d, groups: g };
  }, [sources]);

  if (dedup.length === 0) return null;

  return (
    <div className="px-4 pb-4">
      <button type="button" onClick={() => setOpen(v => !v)} className="mb-2 flex items-center gap-2 group">
        <p className="text-2xs font-semibold text-[var(--slate)] uppercase tracking-wide group-hover:text-[var(--ink)] transition-colors">
          Sources by Type - {dedup.length}
        </p>
        <ChevronDown className={cn("w-3 h-3 text-[var(--slate)] transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-3">
          {groups.map(group => (
            <div key={group.label}>
              <p className="text-2xs font-bold uppercase tracking-wider text-[var(--slate)] mb-1.5">
                {group.label} ({group.items.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.items.map((src, i) => {
                  let host = "";
                  host = hostFromUrl(src.url);
                  const badge = getSourceBadge({ sourceType: src.sourceType, url: src.url });
                  return (
                    <a
                      key={i}
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-md border border-[var(--line)]/40 bg-[var(--surface)]/60 px-2 py-1 text-2xs text-[var(--slate)] transition-all hover:border-[var(--navy)]/40 hover:bg-[var(--navy)]/5 hover:text-[var(--ink)]"
                    >
                      <span className={cn("text-2xs font-bold px-1 rounded", badge.className)}>{badge.label}</span>
                      <span className="max-w-[140px] truncate">{src.title || host}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {!open && (
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {dedup.slice(0, 8).map((src, i) => {
            let host = "";
            host = hostFromUrl(src.url);
            const badge = getSourceBadge({ sourceType: src.sourceType, url: src.url });
            return (
              <a
                key={i}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-[var(--line)]/40 bg-[var(--surface)]/60 px-2.5 py-1.5 text-2xs text-[var(--slate)] transition-all hover:border-[var(--navy)]/40 hover:bg-[var(--navy)]/5 hover:text-[var(--ink)]"
              >
                <span className={cn("text-2xs font-bold px-1 rounded", badge.className)}>{badge.label}</span>
                <span className="max-w-[100px] truncate">{src.title || host}</span>
              </a>
            );
          })}
          {dedup.length > 8 && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex-shrink-0 rounded-lg border border-[var(--navy)]/30 bg-[var(--navy)]/5 px-2.5 py-1.5 text-2xs text-[var(--navy)] transition-colors hover:bg-[var(--navy)]/10"
            >
              +{dedup.length - 8} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const BATCH_STYLES: Record<string, { emoji: string; label: string; color: string; bg: string; border: string }> = {
  data_analyst:    { emoji: "DA", label: "Data Analyst", color: "text-[var(--slate)]", bg: "bg-slate-50/50 dark:bg-slate-900/60", border: "border-slate-300/40" },
  legal_researcher:{ emoji: "LR", label: "Legal Researcher", color: "text-[var(--slate)]", bg: "bg-slate-50/50 dark:bg-slate-900/60", border: "border-slate-300/40" },
  policy_analyst:  { emoji: "PA", label: "Policy Analyst", color: "text-[var(--slate)]", bg: "bg-slate-50/50 dark:bg-slate-900/60", border: "border-slate-300/40" },
  current_affairs: { emoji: "CA", label: "Current Affairs", color: "text-[var(--slate)]", bg: "bg-slate-50/50 dark:bg-slate-900/60", border: "border-slate-300/40" },
  media_journalist: {
    emoji: "MJ",
    label: "Media & Civil Society",
    color: "text-rose-300 dark:text-rose-300",
    bg: "bg-rose-950/30 dark:bg-rose-950/30",
    border: "border-rose-700/30",
  },
};

// ── Copy as MUN Brief Button ─────────────────────────────────────────────────
function MunBriefButton({ dataCheatsheet, answer }: { dataCheatsheet: DataCheatsheet | null; answer: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copyAsBrief = async () => {
    let cheatsheetText = "";
    if (dataCheatsheet) {
      cheatsheetText = "## Data Cheatsheet\n";
      if (dataCheatsheet.numbers.length > 0)
        cheatsheetText += dataCheatsheet.numbers.map(n => `- ${n}`).join("\n") + "\n";
      if (dataCheatsheet.percentages.length > 0)
        cheatsheetText += dataCheatsheet.percentages.map(p => `- ${p}`).join("\n") + "\n";
      cheatsheetText += "\n";
    }
    try {
      await navigator.clipboard.writeText(cheatsheetText + prepareMessageForCopy(answer));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    setTimeout(() => setCopyState("idle"), 2000);
  };
  return (
    <button
      type="button"
      onClick={copyAsBrief}
      className="flex items-center gap-1 text-2xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 px-2 py-1 rounded border border-emerald-400/30 hover:bg-emerald-500/10 transition-colors"
    >
      {copyState === "failed" ? <Clipboard className="w-3 h-3" /> : copyState === "copied" ? <ClipboardCheck className="w-3 h-3" /> : <Clipboard className="w-3 h-3" />}
      {copyState === "failed" ? "Copy failed" : copyState === "copied" ? "Copied!" : "Copy as MUN Brief"}
    </button>
  );
}

async function copyStatChip(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard unavailable */
  }
}
function DataCheatsheetCard({ cheatsheet }: { cheatsheet: DataCheatsheet }) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const copyAll = async () => {
    const lines: string[] = ["## Data Cheatsheet", ""];
    if (cheatsheet.numbers.length > 0) {
      lines.push("### Numbers");
      cheatsheet.numbers.forEach(n => lines.push(`- ${n}`));
      lines.push("");
    }
    if (cheatsheet.percentages.length > 0) {
      lines.push("### Percentages");
      cheatsheet.percentages.forEach(p => lines.push(`- ${p}`));
      lines.push("");
    }
    if (cheatsheet.judgements.length > 0) {
      lines.push("### Court Cases");
      cheatsheet.judgements.forEach(j => lines.push(`- ${j.caseName} (${j.year})\t${j.court}\t${j.held}`));
      lines.push("");
    }
    if (cheatsheet.govReports.length > 0) {
      lines.push("### Government Reports");
      cheatsheet.govReports.forEach(r => lines.push(`- ${r}`));
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const hasNumbers  = cheatsheet.numbers.length > 0 || cheatsheet.percentages.length > 0;
  const hasLegal    = cheatsheet.judgements.length > 0;
  const hasGov      = cheatsheet.govReports.length > 0;
  if (!hasNumbers && !hasLegal && !hasGov) return null;

  return (
    <div className="mx-4 mb-3 rounded-xl border border-slate-300/40 bg-[var(--surface)]/90 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-[var(--surface-muted)]/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[var(--slate)]">Data</span>
          <span className="text-xs font-bold text-[var(--ink)]">Data Cheatsheet</span>
          <span className="text-2xs text-[var(--slate)]">
            {cheatsheet.numbers.length + cheatsheet.percentages.length} stats · {cheatsheet.judgements.length} cases · {cheatsheet.govReports.length} reports
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); copyAll(); }}
            className="flex items-center gap-1 rounded border border-[var(--navy)]/30 px-1.5 py-0.5 text-2xs font-semibold text-[var(--navy)] transition-colors hover:bg-[var(--navy)]/10 hover:text-[var(--navy)]"
          >
            {copied ? <ClipboardCheck className="w-2.5 h-2.5" /> : <Clipboard className="w-2.5 h-2.5" />}
            {copied ? "Copied!" : "Copy All"}
          </button>
          <ChevronDown className={cn("w-3.5 h-3.5 text-[var(--slate)]/60 transition-transform flex-shrink-0", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 border-t border-[var(--line)]/40">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {hasNumbers && (
              <div className="space-y-2">
                {cheatsheet.numbers.length > 0 && (
                  <div>
                    <p className="text-2xs font-bold uppercase tracking-widest text-[var(--slate)] mb-1.5">Numbers</p>
                    <div className="flex flex-wrap gap-1">
                      {cheatsheet.numbers.map((n, i) => (
                        <button
                          type="button"
                          key={i}
                          className="text-2xs bg-slate-500/10 text-[var(--slate)] dark:text-slate-300 rounded px-1.5 py-0.5 cursor-pointer hover:bg-slate-500/20 transition-colors"
                          onClick={() => { void copyStatChip(n); }}
                          title="Click to copy"
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {cheatsheet.percentages.length > 0 && (
                  <div>
                    <p className="text-2xs font-bold uppercase tracking-widest text-[var(--slate)] mb-1.5">Percentages</p>
                    <div className="flex flex-wrap gap-1">
                      {cheatsheet.percentages.map((p, i) => (
                        <button
                          type="button"
                          key={i}
                          className="text-2xs bg-slate-500/10 text-[var(--slate)] dark:text-slate-300 rounded px-1.5 py-0.5 cursor-pointer hover:bg-slate-500/20 transition-colors"
                          onClick={() => { void copyStatChip(p); }}
                          title="Click to copy"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              {hasLegal && (
                <div>
                  <p className="text-2xs font-bold uppercase tracking-widest text-[var(--slate)] mb-1.5">Court Cases</p>
                  <ul className="space-y-1.5">
                    {cheatsheet.judgements.map((j, i) => (
                      <li key={i} className="text-2xs leading-snug">
                        <span className="font-semibold text-[var(--ink)]">{j.caseName} ({j.year})</span>
                        {j.court && <span className="text-[var(--slate)] ml-1">· {j.court}</span>}
                        {j.held && (
                          <p className="text-[var(--slate)] mt-0.5 line-clamp-1">{j.held.slice(0, 80)}{j.held.length > 80 ? "…" : ""}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {hasGov && (
                <div>
                  <p className="text-2xs font-bold uppercase tracking-widest text-[var(--slate)] mb-1.5">Gov Reports</p>
                  <ul className="space-y-0.5">
                    {cheatsheet.govReports.map((r, i) => (
                      <li key={i} className="text-2xs text-[var(--slate)]">
                        <span className="mr-1 text-[var(--navy)]">•</span>{r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BatchCard({ batch }: { batch: BatchState }) {
  const [open, setOpen] = useState(() => batch.status === "active" && (typeof window === "undefined" || window.innerWidth >= 768));
  const s = BATCH_STYLES[batch.role] ?? BATCH_STYLES.data_analyst;
  useEffect(() => { if (batch.status === "active") setOpen(true); }, [batch.status]);

  return (
    <div className={cn("rounded-xl border overflow-hidden", s.bg, s.border)}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-black/5 transition-colors"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <div className={cn("w-2 h-2 rounded-full flex-shrink-0",
            batch.status === "active"   ? "animate-pulse bg-[var(--navy)]" :
            batch.status === "complete" ? "bg-emerald-500" : "bg-[var(--surface-muted)]/30"
          )} />
          <span className="text-xs font-bold">{s.emoji} {batch.batchName}</span>
          <span className={cn("text-2xs font-bold px-1.5 py-0.5 rounded-full border", s.color, s.border, s.bg)}>
            {s.label}
          </span>
          {batch.status === "complete"
            ? batch.findings.length > 0
              ? <span className="text-emerald-500 text-2xs font-semibold">Complete - {batch.findings.length} findings</span>
              : <span className="text-red-500 text-2xs font-semibold">Failed: no findings</span>
            : <span className="text-[var(--slate)] text-2xs font-semibold inline-flex items-center gap-1"><Loader2 className="animate-spin w-3 h-3" /> Researching...</span>}
        </div>
        <ChevronDown className={cn("w-3.5 h-3.5 text-[var(--slate)] transition-transform flex-shrink-0 ml-2", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-3.5 pb-3 pt-1 space-y-2 border-t border-current/10">
          <div className="flex gap-1.5 flex-wrap">
            {batch.models.map((m, i) => (
              <span key={i} className={cn("text-2xs font-bold px-2 py-0.5 rounded-full border", s.color, s.border, s.bg)}>
                {m.replace(/^(groq|nvidia|gemini|openrouter|ollama)\//, "").split("-").slice(0, 3).join("-").slice(0, 24)}
              </span>
            ))}
          </div>
          {batch.status === "complete" && batch.findings.length > 0 && (
            <div className="mt-1">
              <p className="text-2xs font-bold uppercase tracking-wider text-[var(--slate)] mb-1">Key Findings</p>
              <ul className="space-y-0.5">
                {batch.findings.map((f, i) => (
                  <li key={i} className={cn("text-2xs leading-snug", s.color)}>
                    <span className="font-bold mr-1">→</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {batch.status === "complete" && batch.numbers.length > 0 && (
            <div className="mt-2 pt-2 border-t border-[var(--line)]/30">
              <p className="text-2xs font-semibold text-[var(--slate)] mb-1">KEY NUMBERS</p>
              <div className="flex flex-wrap gap-1">
                {batch.numbers.slice(0, 6).map((n, i) => (
                  <button
                    type="button"
                    key={i}
                    className="cursor-pointer rounded bg-[var(--navy)]/10 px-1.5 py-0.5 text-2xs text-[var(--slate)] hover:bg-[var(--navy)]/20 dark:text-[var(--slate)]"
                    onClick={() => { void copyStatChip(n); }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
          {batch.status === "active" && (
            <div className="flex items-center gap-2 text-2xs text-[var(--slate)]">
              <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
              <span>Running sequential role-specific search queries…</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function ResearchPipeline({
  mode,
  isPlanning = false,
  plannerModel = null,
  plannerRoles = null,
  isSynthesizing,
  isVerifying,
  verification,
  isComplete,
  qwenThinking,
  qwenThinkingStream = "",
  isDiscussing = false,
  discussion = null,
  bothExhausted,
  selectedModels = [],
  customModelSearches = {},
  customModelFound = {},
  customModelExhausted = {},
  modelDraftStatus = {},
  queriesPlannedByModel = {},
  researchPlan = [],
  fetchingTotal = 0,
  fetchedCount = 0,
  query = "",
  streamingAnswer = "",
  finalAnswer = "",
  citedNums,
  batches = {},
  dataCheatsheet = null,
  dimensionScores = null,
  activeDivisions = [],
  completedDivisions = [],
  agendaClass = null,
  committeeType = null,
  evidenceSummary = null,
  fullSourceManifest = null,
  citationStatus = null,
  corePipelineEvents = [],
  sourceContract = null,
  sourceGapReport = null,
  coreQualityGate = null,
  selectedResearchMode = null,
  archiveRouting = null,
  researchAngles = [],
  legacyFallbackUsed = false,
  topicStrategy = null,
  isGeminiSynthesizing = false,
  citationCoverage = null,
  searchTier,
  runStatus = "idle",
  allowedPanels,
}: ResearchPipelineProps) {
  const panelVisible = (panelId: LivePanelId) =>
    !allowedPanels || allowedPanels.includes(panelId);
  const [openModels, setOpenModels] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<"idle" | "planning" | "searching" | "synthesizing" | "verifying" | "complete" | "error">("idle");
  const hasStarted = useRef(false);
  const terminalStatus = getStatusSemantics(runStatus);

  useEffect(() => {
    if (!query || hasStarted.current || phase === "complete") return;
    hasStarted.current = true;
    setPhase("searching");
  }, [query, phase]);

  useEffect(() => {
    if (terminalStatus.terminal) {
      setPhase(terminalStatus.severity === "error" ? "error" : "complete");
      return;
    }
    else if (isComplete)        setPhase("complete");
    else if (isVerifying)  setPhase("verifying");
    else if (isSynthesizing) setPhase("synthesizing");
    else if (isPlanning) setPhase("planning");
  }, [isComplete, isVerifying, isSynthesizing, isPlanning, terminalStatus.terminal, terminalStatus.severity]);

  const getModelData = (key: string) => ({
    searches: customModelSearches[key] ?? [],
    found:    customModelFound[key]    ?? [],
    exhausted: customModelExhausted[key] ?? null,
  });

  const activeModels = selectedModels.length > 0 ? selectedModels : [];
  const allSources   = fullSourceManifest?.sources?.length
    ? dedupeSourceResults(fullSourceManifest.sources.map((source) => ({
        title: source.title,
        index: source.sourceId ?? source.index,
        sourceId: source.sourceId ?? source.index,
        url: source.url,
        sourceType: source.sourceType,
        excerpt: source.contentPreview,
        badge: source.badge,
        hasFullContent: source.hasFullContent,
        judgement: source.judgement,
      })))
    : dedupeSourceResults(Object.values(customModelFound).flat());
  // Filter to only user-facing events - hide internal cache/cooldown/stale events
  const userFacingEvents = corePipelineEvents.filter((event) => isUserFacingEvent(event.type));
  const recentCoreEvents = userFacingEvents.slice(-4).reverse();
  const promptBudgetReports = useMemo(() => collectPromptBudgetReports(corePipelineEvents), [corePipelineEvents]);
  const latestPromptBudgetReport = promptBudgetReports.at(-1) ?? null;
  const cleanStreamingAnswer = useMemo(() => cleanMessageContent(streamingAnswer), [streamingAnswer]);
  const cleanFinalAnswer = useMemo(() => cleanMessageContent(finalAnswer), [finalAnswer]);
  const visibleAnswer = cleanFinalAnswer || cleanStreamingAnswer;

  const toggleModel = (key: string) => {
    setOpenModels(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ── Normal mode (Qwen thinking) ──────────────────────────────────────────
  if (mode === "normal") {
    if ((qwenThinkingStream.length > 0 || qwenThinking.length > 0) && (isVerifying || !verification)) {
      return (
        <div className="mb-4 px-1">
          <QwenThinking
            modelLabel="Qwen"
            thinkingStream={qwenThinkingStream}
            thinkingSteps={qwenThinking}
            isActive={!verification}
          />
        </div>
      );
    }
    return null;
  }

  const currentPhaseLabel =
    terminalStatus.terminal ? terminalStatus.label
    : phase === "searching"    ? "Active Research"
    : phase === "synthesizing" ? "Synthesizing Results"
    : phase === "verifying"    ? "Verifying Facts"
    : phase === "complete"     ? "Research Complete"
    : phase === "error"        ? "Research Failed"
    : "Initializing...";
  const terminalDotClass =
    terminalStatus.severity === "error" ? "bg-red-500"
    : terminalStatus.severity === "warning" ? "bg-[color-mix(in_srgb,var(--brass)_8%,transparent)]"
    : terminalStatus.severity === "info" ? "bg-sky-500"
    : "bg-emerald-500";
  const terminalAlertClass =
    terminalStatus.severity === "warning"
      ? "border-amber-300/60 bg-[color-mix(in_srgb,var(--brass)_8%,transparent)] text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"
      : terminalStatus.severity === "info"
        ? "border-sky-300/60 bg-sky-50 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100"
        : "border-red-300/60 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100";
  const sourceUsageFailed = runStatus === "failed" && corePipelineEvents.some((event) =>
    event.type === "pipeline_failed" && String(event.data?.code ?? "").includes("SOURCE_USAGE_VALIDATION_FAILED")
  );
  const sourceUsageFailureReport = corePipelineEvents
    .map((event) => event.data?.sourceUsageFailureReport as {
      roleName?: string;
      reason?: string;
      validUsageCount?: number;
      invalidUsageCount?: number;
      failedSourceIds?: number[];
      providerErrors?: Array<{ provider?: string; message?: string }>;
      recommendedAction?: string;
    } | undefined)
    .find(Boolean);

  const snapshot = buildSnapshot(activeModels, customModelFound);
  const estimatePlannedQueries = (key: string): number => {
    const serverCount = queriesPlannedByModel[key];
    if (serverCount && serverCount > 0) return serverCount;
    if (researchPlan.length > 0 && activeModels.length > 0) {
      return Math.max(1, Math.ceil(researchPlan.length / activeModels.length) + (mode === "deep_research" ? 2 : 1));
    }
    return mode === "deep_research" ? 20 : 8;
  };
  const getModelProgress = (key: string, data: ReturnType<typeof getModelData>) => {
    const draftStatus = modelDraftStatus[key];
    const plannedQueries = estimatePlannedQueries(key);
    const queryCount = data.searches.filter((query) => query.trim().length > 0).length;
    const searchRatio = Math.min(1, queryCount / plannedQueries);
    const readingRatio = fetchingTotal > 0
      ? Math.min(1, fetchedCount / fetchingTotal)
      : data.found.length > 0
        ? Math.min(1, data.found.length / Math.max(4, plannedQueries))
        : 0;

    let percent = isPlanning ? 4 : 0;
    let status: "searching" | "reading" | "drafting" | "merging" | "verifying" | "done" | "warning" | "error" | "idle" =
      isPlanning ? "searching" : "idle";
    let statusLabel = isPlanning ? "Planning..." : "Waiting...";

    if (queryCount > 0) {
      percent = Math.max(percent, Math.round(5 + searchRatio * 35));
      status = "searching";
      statusLabel = `Searching ${queryCount}/${plannedQueries}`;
    }
    if (readingRatio > 0) {
      percent = Math.max(percent, Math.round(40 + readingRatio * 20));
      status = "reading";
      statusLabel = fetchingTotal > 0 ? `Reading ${fetchedCount}/${fetchingTotal}` : `Reading sources`;
    }
    if (draftStatus === "drafting") {
      percent = Math.max(percent, 70);
      status = "drafting";
      statusLabel = "Drafting answer";
    }
    if (draftStatus === "complete") {
      percent = Math.max(percent, 85);
      status = "drafting";
      statusLabel = "Draft complete";
    }
    if (phase === "synthesizing" || isSynthesizing) {
      percent = Math.max(percent, 91);
      status = "merging";
      statusLabel = "Merging findings";
    }
    if (phase === "verifying" || isVerifying) {
      percent = Math.max(percent, 97);
      status = "verifying";
      statusLabel = "Verifying citations";
    }
    if (phase === "complete" || isComplete) {
      percent = 100;
      status = "done";
      statusLabel = "Complete";
    }
    if (data.exhausted) {
      percent = 100;
      status = "error";
      statusLabel = data.exhausted.reason === "rate_limit" ? "Rate limited" : "Failed";
    }
    if (terminalStatus.terminal && !terminalStatus.success) {
      percent = 100;
      status = terminalStatus.severity === "error" ? "error" : "warning";
      statusLabel = terminalStatus.label;
    }

    return { percent: Math.min(100, percent), status, statusLabel, plannedQueries, queryCount };
  };

  return (
    <div className="research-pipeline-shell w-full min-w-0 overflow-hidden rounded-lg border border-[var(--line)]/50 bg-[var(--surface)]/95 shadow-sm mb-6">

      {/* ── Phase header bar ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]/30 bg-[var(--surface-muted)]/30">
        <div className="flex items-center gap-2.5">
          {phase !== "complete" && phase !== "error"
            ? <div className="h-2 w-2 animate-pulse rounded-full bg-[var(--navy)]" />
            : <div className={cn("w-2 h-2 rounded-full", terminalDotClass)} />}
          <span className="text-xs font-semibold tracking-wide text-[var(--ink)]/80 uppercase">
            {currentPhaseLabel}
          </span>
        </div>
        {phase !== "complete" && phase !== "error" && (
          <div className="flex gap-0.5">
            {[0, 0.15, 0.3].map(d => (
              <div key={d} className="h-3 w-1 animate-bounce rounded-full bg-[var(--navy)]" style={{ animationDelay: `${d}s` }} />
            ))}
          </div>
        )}
      </div>

      {(phase === "error" || (terminalStatus.terminal && !terminalStatus.success)) && (
        <div className={cn("mx-4 mt-3 mb-3 rounded-lg border p-3 text-sm", terminalAlertClass)}>
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">{sourceUsageFailed ? "Source Usage Failed" : terminalStatus.label}</p>
              <p className="mt-1 text-xs">
                {sourceUsageFailed
                  ? "Reason: The model listed sources without extracting/supporting claims."
                  : runStatus === "completed_with_source_gaps"
                    ? "Reason: The run reached a terminal state with missing or weak source coverage."
                    : runStatus === "degraded_fallback"
                      ? "Reason: Generation providers failed after retrieval; BestDel returned an explicit degraded fallback instead of hiding the failure."
                    : runStatus === "legacy_fallback_used"
                      ? "Reason: The guarded core pipeline did not produce a fully verified answer and a legacy fallback was used."
                      : "Reason: The research run could not complete."}
              </p>
              {sourceUsageFailureReport && (
                <div className="mt-2 grid gap-1 text-xs">
                  <p>Role: {sourceUsageFailureReport.roleName ?? "source usage role"}</p>
                  <p>Valid usage: {sourceUsageFailureReport.validUsageCount ?? 0}; invalid usage: {sourceUsageFailureReport.invalidUsageCount ?? 0}; failed sources: {sourceUsageFailureReport.failedSourceIds?.length ?? 0}</p>
                  {sourceUsageFailureReport.providerErrors?.length ? (
                    <p>Provider errors: {sourceUsageFailureReport.providerErrors.map((error) => `${error.provider ?? "provider"} ${error.message ?? ""}`).join("; ")}</p>
                  ) : null}
                  {sourceUsageFailureReport.recommendedAction ? <p>Recommendation: {sourceUsageFailureReport.recommendedAction.replace(/_/g, " ")}</p> : null}
                </div>
              )}
              <p className="mt-1 text-xs">
                {sourceUsageFailed
                  ? "Action: Retrying used stricter prompts, smaller batches, and healthy model fallback before failing."
                  : "Suggestions: configure a working model provider, reduce the source requirement, or retry."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Fetching Progress Bar ──────────────────────────────────────────── */}
      {fetchingTotal > 0 && phase !== "complete" && (
        <div className="px-4 py-2 border-b bg-slate-50/50 dark:bg-slate-900/30 flex items-center gap-2 text-2xs">
          <Download className="w-3 h-3 text-[var(--navy)] animate-pulse" />
          <span className="font-medium text-[var(--ink)]">Fetching {fetchedCount}/{fetchingTotal} pages</span>
          <div className="flex-1 h-1 bg-[var(--surface-muted)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--navy)] transition-all duration-500"
              style={{ width: `${Math.round((fetchedCount / fetchingTotal) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Sequential batch progress cards ───────────────────── */}
      {Object.keys(batches).length > 0 && (
        <div className="px-4 pt-3 pb-1 space-y-2">
          <p className="text-2xs font-bold uppercase tracking-widest text-[var(--slate)]">Sequential Research Batches</p>
          {Object.values(batches).map(batch => (
            <BatchCard key={batch.batchName} batch={batch} />
          ))}
        </div>
      )}

      {/* ── Data Cheatsheet (between batches and discussion) ──────────────── */}
      {dataCheatsheet && (dataCheatsheet.numbers.length > 0 || dataCheatsheet.judgements.length > 0 || dataCheatsheet.govReports.length > 0) && (
        <DataCheatsheetCard cheatsheet={dataCheatsheet} />
      )}

      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">

      {/* ── Model progress mini-cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {activeModels.map((key, idx) => {
          const meta = modelMetaFromKey(key);
          const data = getModelData(key);
          const persona = getResearchPersona(idx);
          const { percent, status, statusLabel, plannedQueries, queryCount } = getModelProgress(key, data);

          return (
            <div
              key={key}
              className="flex flex-col gap-2 rounded-xl border border-[var(--line)]/40 bg-[var(--surface)]/60 p-3 backdrop-blur-sm transition-colors hover:border-[var(--navy)]/30"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-2xs font-semibold text-[var(--slate)] truncate max-w-[90px]">
                  {meta.label}
                </span>
                <span className={cn("text-2xs font-bold px-1.5 py-0.5 rounded-full border", persona.color)}>
                  {persona.emoji} {persona.label}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={cn(
                  "text-2xs font-bold",
                  status === "searching" && "text-[var(--navy)]",
                  status === "reading"   && "text-[var(--navy)]",
                  status === "drafting"  && "text-slate-500",
                  status === "merging"   && "text-amber-500",
                  status === "verifying" && "text-sky-500",
                  status === "done"      && "text-emerald-500",
                  status === "warning"   && "text-amber-500",
                  status === "error"     && "text-red-400",
                  status === "idle"      && "text-[var(--slate)]",
                )}>
                  {percent}%
                </span>
              </div>
              <div className="w-full h-1 rounded-full bg-[var(--surface-muted)] overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    status === "searching" && "bg-[var(--navy)]",
                    status === "reading"   && "bg-[var(--navy)]",
                    status === "drafting"  && "bg-slate-500",
                    status === "merging"   && "bg-[color-mix(in_srgb,var(--brass)_8%,transparent)]",
                    status === "verifying" && "bg-sky-500",
                    status === "done"      && "bg-emerald-500",
                    status === "warning"   && "bg-[color-mix(in_srgb,var(--brass)_8%,transparent)]",
                    status === "error"     && "bg-red-400",
                    status === "idle"      && "bg-[var(--surface-muted)]/30",
                  )}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className={cn(
                "text-2xs font-medium",
                status === "searching" && "text-[var(--navy)]",
                status === "reading"   && "text-[var(--navy)]",
                status === "drafting"  && "text-slate-500",
                status === "merging"   && "text-amber-500",
                status === "verifying" && "text-sky-500",
                status === "done"      && "text-emerald-400",
                status === "warning"   && "text-amber-500",
                status === "error"     && "text-red-400",
                status === "idle"      && "text-[var(--slate)]/50",
              )}>
                {statusLabel}
              </span>
              <span className="text-2xs text-[var(--slate)]/60">
                {queryCount}/{plannedQueries} planned queries
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Per-model accordion (queries + sources + court + numbers) ─────── */}
      {activeModels.some(k => {
        const d = getModelData(k);
        return d.searches.length > 0 || d.found.length > 0;
      }) && (
        <div className="rounded-xl border border-[var(--line)]/40 overflow-hidden divide-y divide-border/30">
          {activeModels.map((key, idx) => {
            const data    = getModelData(key);
            const meta    = modelMetaFromKey(key);
            const persona = getResearchPersona(idx);
            if (data.searches.length === 0 && data.found.length === 0) return null;
            const isOpen = openModels.has(key);

            const courtResults  = data.found.filter(isCourtSource);
            const govResults    = data.found.filter(s => !isCourtSource(s) && classifySource(s) === "gov");

            return (
              <div key={key} className="bg-[var(--surface)]/40">
                {/* Accordion header */}
                <button
                  type="button"
                  onClick={() => toggleModel(key)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-[var(--surface-muted)]/40 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", meta.color)} />
                    <span className="text-xs font-semibold text-[var(--ink)]/80">
                      {meta.label}
                    </span>
                    <span className={cn("text-2xs font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0", persona.color)}>
                      {persona.emoji} {persona.label}
                    </span>
                    <span className="flex-shrink-0 rounded-full bg-[var(--navy)]/10 px-1.5 py-0.5 text-2xs font-bold text-[var(--navy)]">
                      {data.searches.length} queries · {data.found.length} sources
                    </span>
                    {courtResults.length > 0 && (
                      <span className="flex-shrink-0 rounded-full bg-[var(--brass)]/10 px-1.5 py-0.5 text-2xs font-bold text-amber-700 dark:text-amber-400">
                        {courtResults.length} court
                      </span>
                    )}
                    {govResults.length > 0 && (
                      <span className="text-2xs font-bold text-[var(--slate)] dark:text-slate-300 bg-slate-500/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        {govResults.length} gov
                      </span>
                    )}
                  </div>
                  <ChevronDown className={cn(
                    "w-3.5 h-3.5 text-[var(--slate)] transition-transform duration-200 flex-shrink-0 ml-2",
                    isOpen && "rotate-180"
                  )} />
                </button>

                {data.searches.length > 0 && (
                  <p className="text-2xs text-[var(--slate)] italic truncate px-4 pb-1">
                    "{data.searches[data.searches.length - 1]}"
                  </p>
                )}

                {isOpen && (
                  <div className="px-3.5 pb-3 pt-1 space-y-3 border-t border-[var(--line)]/20">

                    {/* Query chips */}
                    {data.searches.length > 0 && (
                      <div>
                        <p className="text-2xs font-semibold text-[var(--slate)] uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                          <Globe className="h-3 w-3 text-[var(--navy)]" />
                          Research Queries
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {data.searches.map((q, i) => (
                            <span
                              key={i}
                              className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--navy)]/30 bg-[var(--navy)]/8 px-2 py-1 text-2xs text-[var(--slate)]"
                            >
                              <span className="font-bold text-[var(--navy)]">{i + 1}.</span>
                              <span className="truncate max-w-[200px]">{q}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sources with type badges */}
                    {data.found.length > 0 && (
                      <div>
                        <p className="text-2xs font-semibold text-[var(--slate)] uppercase tracking-wide mb-1.5">
                          Sources Found · {data.found.length}
                        </p>
                        <div className="overflow-hidden rounded-lg border border-[var(--line)]/30 divide-y divide-border/20">
                          {data.found.map((src, i) => {
                            const badge = getSourceBadge({ sourceType: src.sourceType, url: src.url });
                            return (
                              <a
                                key={i}
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group flex items-center gap-2 px-3.5 py-1.5 hover:bg-[var(--surface-muted)]/30 transition-colors"
                              >
                                <span className={cn("shrink-0 text-2xs font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide", badge.className)}>
                                  {badge.label}
                                </span>
                                <span className="flex-1 text-xs text-[var(--ink)]/80 group-hover:text-[var(--ink)] truncate leading-tight transition-colors">
                                  {src.title || hostFromUrl(src.url) || src.url}
                                </span>
                                <span className="text-2xs text-[var(--slate)] shrink-0 hidden sm:block">
                                  {hostFromUrl(src.url)}
                                </span>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Court judgements found */}
                    {courtResults.length > 0 && (
                      <div>
                        <p className="mb-1.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                          <Scale className="w-3 h-3" />
                          Court Judgements Found
                        </p>
                        <div className="flex flex-col gap-1">
                          {courtResults.map((src, i) => {
                            let host = "";
                            host = hostFromUrl(src.url);
                            return (
                              <a
                                key={i}
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--brass)_30%,transparent)] bg-[color-mix(in_srgb,var(--brass)_8%,transparent)]/40 p-2 transition-colors hover:bg-[color-mix(in_srgb,var(--brass)_12%,transparent)] dark:border-[var(--brass)]/35 dark:bg-[var(--brass)]/10"
                              >
                                <span className="mt-0.5 text-sm text-amber-700 dark:text-amber-400">CT</span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold text-[var(--navy)] truncate">
                                    {src.title || "Court Judgement"}
                                  </p>
                                  <p className="text-2xs text-[var(--slate)] truncate">{host}</p>
                                </div>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Government sources highlight */}
                    {govResults.length > 0 && (
                      <div>
                        <p className="text-2xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                          <FileText className="w-3 h-3" />
                          Government Reports Found
                        </p>
                        <div className="flex flex-col gap-1">
                          {govResults.slice(0, 5).map((src, i) => {
                            const badge = getSourceBadge({ sourceType: src.sourceType, url: src.url });
                            return (
                              <a
                                key={i}
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-green-200/50 dark:border-green-800/50 bg-green-50/40 dark:bg-green-950/20 hover:bg-green-100/40 transition-colors text-2xs"
                              >
                                <span className={cn("text-2xs font-bold px-1 py-0.5 rounded flex-shrink-0", badge.className)}>
                                  {badge.label}
                                </span>
                                <span className="truncate text-green-700 dark:text-green-300">
                                  {src.title || src.url}
                                </span>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <QueryPlannerCard
        isPlanning={isPlanning ?? false}
        plannerModel={plannerModel}
        plannerRoles={plannerRoles}
        searchTier={searchTier}
      />

      {panelVisible("dimension_scores") || panelVisible("division_progress") ? (
        <>
          {panelVisible("dimension_scores") ? (
            <DimensionDisplay
              scores={dimensionScores}
              agendaClass={agendaClass}
              committeeType={committeeType}
              collapsed={completedDivisions.length > 0}
            />
          ) : null}
          {panelVisible("division_progress") ? (
            <DivisionProgressTracker
              activeDivisions={activeDivisions}
              completedDivisions={completedDivisions}
            />
          ) : null}
        </>
      ) : null}

      {isSynthesizing && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          <PhasePill label="Planning" done={true} active={false} />
          <PhasePill label="Searching" done={true} active={false} />
          <PhasePill label="Enriching" done={true} active={false} />
          <PhasePill label="Synthesis" done={false} active={true} />
          <PhasePill label="Verify" done={false} active={false} />
        </div>
      )}
      {isVerifying && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          <PhasePill label="Planning" done={true} active={false} />
          <PhasePill label="Searching" done={true} active={false} />
          <PhasePill label="Enriching" done={true} active={false} />
          <PhasePill label="Synthesis" done={true} active={false} />
          <PhasePill label="Verify" done={false} active={true} />
        </div>
      )}

      {/* ── Cross-Model Discussion / Merge Status ───────────────────────────── */}
      {(isDiscussing || discussion || isSynthesizing) && (
        <div className="mb-3 rounded-xl border border-slate-300/40 bg-[var(--surface)]/90 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--line)]/60">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
              <Loader2 className={cn("h-4 w-4", (isDiscussing || isSynthesizing) && "animate-spin")} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--ink)]">
                {isSynthesizing ? "Merging model responses" : "Comparing model findings"}
              </p>
              <p className="text-xs text-[var(--slate)]">
                {isSynthesizing
                  ? "Blending the strongest facts, citations, and disagreements into one answer."
                  : "Sorting out overlaps, unique evidence, and the strongest sources across models."}
              </p>
            </div>
          </div>
          {discussion && (
            <div className="px-4 py-3 text-sm leading-relaxed space-y-1">
              {discussion.split("\n").filter(l => l.trim()).map((line, i) => {
                const LABEL_COLORS: [RegExp, string][] = [
                  [/\[Data Coverage\]/i,        "text-[var(--slate)]"],
                  [/\[Legal Framework\]/i,       "text-[var(--navy)]"],
                  [/\[Policy Positions\]/i,      "text-[var(--slate)] dark:text-slate-300"],
                  [/\[Contradictions\]/i,        "text-red-700 dark:text-red-300"],
                  [/\[Research Gaps\]/i,         "text-[var(--slate)] dark:text-slate-300"],
                  [/\[Unique Contributions\]/i,  "text-[var(--navy)]"],
                ];
                const clean = line.replace(/^[-*•]\s*/, "").replace(/\*\*/g, "");
                const match = LABEL_COLORS.find(([re]) => re.test(clean));
                if (match) {
                  const [re, color] = match;
                  const parts = clean.split(re);
                  const label = clean.match(re)?.[0] ?? "";
                  return (
                    <p key={i} className="flex gap-1.5 items-baseline">
                      <span className="text-[var(--slate)] shrink-0">•</span>
                      <span>
                        {parts[0]}
                        <span className={cn("font-semibold", color)}>{label}</span>
                        {parts.slice(1).join("")}
                      </span>
                    </p>
                  );
                }
                return (
                  <p key={i} className="flex gap-1.5 items-baseline text-[var(--ink)]/80">
                    {line.trim().startsWith("-") || line.trim().startsWith("*")
                      ? <><span className="text-[var(--slate)] shrink-0">•</span><span>{clean}</span></>
                      : <span>{clean}</span>}
                  </p>
                );
              })}
            </div>
          )}
          {(isDiscussing || isSynthesizing) && !discussion && (
            <div className="px-4 py-3 flex items-center gap-2 text-xs text-[var(--slate)]">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{isSynthesizing ? "Drafts are being folded into one answer…" : "Analyzing what each model uniquely found…"}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Streaming answer (hero) ──────────────────────────────────────────── */}
      {visibleAnswer && (
        <div className="desk-panel research-answer-hero mb-4 rounded-md border border-[var(--line)] border-t-[3px] border-t-[var(--brass)] bg-[var(--bg-base)] p-4 shadow-[var(--shadow-card)] sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="label-ui text-amber-700 dark:text-amber-400">Research Answer</p>
              <div className="mt-1 h-px w-10 bg-[var(--brass)]" aria-hidden />
            </div>
            {phase === "complete" && (
              <MunBriefButton dataCheatsheet={dataCheatsheet} answer={visibleAnswer} />
            )}
          </div>
          <div className="max-w-[72ch]">
            {(() => {
              const { thinking, mainContent: cleanMain, isThinkingFinished } = extractThinking(visibleAnswer, { streamEnded: phase === "complete" });
              const answerSources = allSources
                .map((s, i) => ({
                  sourceId: (s as { sourceId?: number; index?: number }).sourceId ?? (s as { index?: number }).index ?? i + 1,
                  title: s.title,
                  url: s.url,
                }))
                .filter((s) => Boolean(s.url));
              return (
                <>
                  {thinking && <ThoughtBlock thinking={thinking} isThinkingFinished={isThinkingFinished} />}
                  {cleanMain && (
                    phase === "complete" ? (
                      <ResearchAnswerBody
                        content={cleanMain}
                        sources={answerSources}
                        citationStatus={citationStatus}
                        hideSourcesFooter
                      />
                    ) : (
                      <StreamingText
                        content={cleanMain}
                        isStreaming
                        sources={answerSources}
                        citationStatus={citationStatus}
                      />
                    )
                  )}
                </>
              );
            })()}
          </div>
          {/* Fix (Bug L1476): only blink cursor while actively streaming, not after */}
          {phase !== "complete" && (
            <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-[blink_1s_step-end_infinite] bg-[var(--navy)]" />
          )}
        </div>
      )}

      {/* ── Data Snapshot (collapsed telemetry) ─────────────────────────────── */}
      {(isSynthesizing || isComplete || snapshot.total > 0) && (snapshot.total > 0 || activeModels.some(k => (customModelFound[k]?.length ?? 0) > 0)) && (
        <DataSnapshot snapshot={snapshot} />
      )}

        </div>

        <aside className="min-w-0 rounded-xl border border-[var(--line)]/50 bg-[var(--surface-muted)]/20 p-3 xl:sticky xl:top-3 xl:max-h-[70vh] xl:overflow-auto">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-2xs font-bold uppercase tracking-[0.16em] text-[var(--slate)]">Sources</p>
              <p className="mt-0.5 text-xs text-[var(--ink)]/70">Live evidence beside the answer, not mixed into it.</p>
            </div>
            <Newspaper className="h-4 w-4 shrink-0 text-[var(--navy)]" />
          </div>
          <SourceMixChart snapshot={snapshot} />
          <SourceListPanel
            results={allSources}
            usedSourceIds={new Set(citationStatus?.citedSourceIds ?? [])}
            answerText={visibleAnswer}
            evidenceSummary={evidenceSummary}
          />
        </aside>
      </div>

      {/* ── Deep Research strategy plan (collapsed by default) ───────────── */}
      {panelVisible("research_strategy") && researchPlan.length > 0 && phase !== "complete" && (
        <details className="mx-4 mb-4 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)]">
          <summary className="cursor-pointer select-none px-3 py-2 text-2xs font-bold uppercase tracking-wide text-[var(--navy)] hover:bg-[var(--surface-muted)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brass)]/40 focus-visible:ring-offset-2">
            Research Strategy · {researchPlan.length} angles
          </summary>
          <ul className="space-y-1 border-t border-[var(--line)] px-3 py-2">
            {researchPlan.slice(0, 8).map((plan, i) => (
              <li key={i} className="truncate text-xs text-[var(--slate)]">
                <span className="mr-1.5 text-[var(--navy)]">→</span> {plan}
              </li>
            ))}
            {researchPlan.length > 8 && (
              <li className="text-2xs italic text-[var(--slate)]">
                …and {researchPlan.length - 8} more angles
              </li>
            )}
          </ul>
        </details>
      )}

      {panelVisible("topic_strategy") && topicStrategy && (
        <details className="mx-4 mb-4 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)]">
          <summary className="cursor-pointer select-none px-3 py-2 text-2xs font-bold uppercase tracking-wide text-[var(--navy)] hover:bg-[var(--surface-muted)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brass)]/40 focus-visible:ring-offset-2">
            Topic Strategy · {topicStrategy.topicClass}
          </summary>
          <p className="border-t border-[var(--line)] px-3 py-2 text-xs text-[var(--slate)]">
            Priority: {topicStrategy.sourcePriorities.join(" -> ")}
          </p>
        </details>
      )}

      {panelVisible("guarded_pipeline") && (sourceContract || coreQualityGate || sourceGapReport || recentCoreEvents.length > 0 || latestPromptBudgetReport || selectedResearchMode || archiveRouting || researchAngles.length > 0 || legacyFallbackUsed) && (
        <details className="mx-4 mb-4 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)]">
          <summary className="flex cursor-pointer list-none select-none items-center justify-between gap-2 px-3 py-2 hover:bg-[var(--surface-muted)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brass)]/40 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
            <span className="text-2xs font-bold uppercase tracking-wide text-[var(--slate)]">
              Guarded Research Pipeline
            </span>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {selectedResearchMode && (
                <span className="rounded-sm bg-[color-mix(in_srgb,var(--navy)_10%,transparent)] px-2 py-0.5 text-2xs font-semibold text-[var(--navy)]">
                  {selectedResearchMode.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                </span>
              )}
              <StatusBadge status={runStatus} label={legacyFallbackUsed ? "Legacy fallback" : undefined} />
              {coreQualityGate && (
                <span className={cn(
                  "rounded-sm px-2 py-0.5 text-2xs font-semibold",
                  coreQualityGate.passed && coreQualityGate.repairRequired !== true && coreQualityGate.automaticFailures.length === 0
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "bg-[color-mix(in_srgb,var(--brass)_10%,transparent)] text-amber-700 dark:text-amber-300",
                )}>
                  Quality {coreQualityGate.score}
                </span>
              )}
            </div>
          </summary>
          <div className="space-y-3 border-t border-[var(--line)] p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {archiveRouting && (
              <div className="rounded-lg border border-[var(--line)]/40 bg-[var(--surface)]/70 p-2.5">
                <p className="text-2xs font-semibold text-[var(--slate)]">Archive Routing</p>
                <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                  {archiveRouting.suggestedAction.replace(/_/g, " ")}
                </p>
                <p className="mt-1 text-2xs text-[var(--slate)]">
                  {archiveRouting.relationType.replace(/_/g, " ")} · {Math.round(archiveRouting.confidence * 100)}%
                </p>
              </div>
            )}
            <SourceContractPanel contract={sourceContract} gapReport={sourceGapReport} />
            <QualityGatePanel gate={coreQualityGate} />
            {recentCoreEvents.length > 0 && (
              <div className="rounded-lg border border-[var(--line)]/40 bg-[var(--surface)]/70 p-2.5">
                <p className="text-2xs font-semibold text-[var(--slate)]">Latest Checks</p>
                <div className="mt-1 space-y-0.5">
                  {recentCoreEvents.map((event) => (
                    <p key={`${event.type}-${event.timestamp}`} className={`flex min-w-0 items-center gap-1 truncate text-2xs ${pipelineCheckClass(event.type)}`}>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${pipelineCheckDotClass(event.type)}`} />
                      <span className="truncate">{event.type.replace(/_/g, " ")}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}
            <PromptBudgetPanel report={latestPromptBudgetReport} />
            <ProviderRuntimePanel events={corePipelineEvents} selectedModels={activeModels} legacyFallbackUsed={legacyFallbackUsed} />
          </div>
          {researchAngles.length > 0 && (
            <div className="grid gap-2 md:grid-cols-2">
              {researchAngles.slice(0, 4).map((angle) => (
                <div key={angle.id} className="rounded-lg border border-[var(--line)]/40 bg-[var(--surface)]/70 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-[var(--ink)]">{angle.title}</p>
                    <span className="shrink-0 rounded-full border border-[var(--navy)]/30 bg-[var(--navy)]/10 px-1.5 py-0.5 text-2xs font-semibold text-[var(--navy)] dark:text-[var(--navy)]">
                      {angle.bestSide}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-3 text-2xs leading-snug text-[var(--slate)]">{angle.whyItMatters}</p>
                  <p className="mt-1 truncate text-2xs text-[var(--slate)]">
                    Buckets: {angle.sourceBucketsNeeded.join(", ")}
                  </p>
                </div>
              ))}
            </div>
          )}
          </div>
        </details>
      )}

      {(isGeminiSynthesizing || citationCoverage) && (
        <div className="mx-4 mb-4 rounded-xl border border-[var(--navy)]/30 bg-[var(--surface)]/90 p-3">
          <p className="mb-2 text-2xs font-bold uppercase text-[var(--navy)]">
            {isGeminiSynthesizing ? "Gemini Synthesizing" : "Citation Coverage"}
          </p>
          {citationCoverage && (
            <p className="text-xs text-[var(--slate)]">
              Coverage: {Math.round(citationCoverage.coveragePct)}%
              {citationCoverage.missingIds.length > 0 ? ` | Missing: ${citationCoverage.missingIds.join(", ")}` : " | All indexed sources covered"}
            </p>
          )}
        </div>
      )}

      {/* ── Exhaustion alert ──────────────────────────────────────────────── */}
      {!isComplete && bothExhausted && (
        <div className="mx-4 mb-4 p-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 text-red-600 flex items-center gap-2 text-xs">
          <AlertCircle className="w-4 h-4" />
          <span>All research models exhausted. Completing with fallback model.</span>
        </div>
      )}
    </div>
  );
}
