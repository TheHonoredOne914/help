import { useState } from "react";
import { AlertCircle, ChevronDown, Globe, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  extractPipelineMetadata,
  type LegacyPipelineModel,
  type PipelineMetadata,
  type PipelineMetadataIdentity,
  type PipelineTerminalStatus,
} from "@/lib/pipeline-metadata";
import { providerChipColor } from "@/lib/provider-colors";
import { classifySourceBucket } from "@/lib/source-semantics";
import { StatusBadge } from "./research-pipeline/StatusBadge";

export type PersistedPipelineMetadata = PipelineMetadata;

export function extractPipelineMeta(content: string, identity?: number | string | PipelineMetadataIdentity): {
  cleanContent: string;
  meta: PersistedPipelineMetadata | null;
} {
  const { cleanContent, metadata } = extractPipelineMetadata(content, identity);
  return { cleanContent, meta: metadata };
}

const classifySource = classifySourceBucket;

const TERMINAL_STATUSES: readonly PipelineTerminalStatus[] = [
  "completed",
  "completed_with_source_gaps",
  "degraded_fallback",
  "failed",
  "provider_error",
  "legacy_fallback_used",
  "cancelled",
];

function isTerminalStatus(value: unknown): value is PipelineTerminalStatus {
  return typeof value === "string" && (TERMINAL_STATUSES as readonly string[]).includes(value);
}

function resolveTerminalStatus(meta: PersistedPipelineMetadata): PipelineTerminalStatus {
  if (isTerminalStatus(meta.terminalStatus)) return meta.terminalStatus;
  if (isTerminalStatus(meta.runStatus)) return meta.runStatus;
  if (meta.legacyFallbackUsed) return "legacy_fallback_used";
  // Fix (Bug: L45): check both passed === false AND absence of a pass indicator
  if (meta.qualityGate?.passed === false || meta.sourceContract?.status === "failed") return "failed";
  if (meta.sourceContract?.status === "passed_with_source_gaps" || meta.sourceGapReport) return "completed_with_source_gaps";
  return "completed";
}

function sourceGapExplanation(meta: PersistedPipelineMetadata): string {
  const report = meta.sourceGapReport as { explanation?: string } | null | undefined;
  return report?.explanation ?? "Targets were not fully met.";
}

/** Fix (Bug: L97, B09-001): normalise URLs for deduplication, preserving resource-identifying query params */
function normaliseUrlForDedup(url: string): string {
  try {
    const parsed = new URL(url.toLowerCase());
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^utm_|fbclid|gclid|mc_cid|mc_eid/i.test(key)) parsed.searchParams.delete(key);
    }
    parsed.hostname = parsed.hostname.replace(/^m\./, "").replace(/^amp\./, "");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.toLowerCase().trim();
  }
}

export function PersistedPipeline({ meta }: { meta: PersistedPipelineMetadata }) {
  const [openModel, setOpenModel] = useState<string | null>(null);
  const [showDiscussion, setShowDiscussion] = useState(false);
  const [showSources, setShowSources] = useState(false);

  // Fix (Bug: L83): safely access models with a fallback for unknown schema shapes
  const legacyModels: LegacyPipelineModel[] = (() => {
    const raw = meta.legacyDebug?.models ?? meta.models ?? [];
    return (raw as unknown[]).filter(
      (m): m is LegacyPipelineModel =>
        m != null &&
        typeof m === "object" &&
        "key" in (m as object) &&
        Array.isArray((m as any).searches) &&
        Array.isArray((m as any).found),
    );
  })();

  const legacyDiscussion = meta.legacyDebug?.discussion ?? meta.discussion ?? null;
  const structuredSources = meta.sources ?? [];
  const status = resolveTerminalStatus(meta);
  const hasContractActivity = Boolean(meta.runId || meta.sourceContract || meta.sourceGapReport || meta.qualityGate || meta.citationStatus);
  const hasLegacyActivity =
    legacyModels.some((m) => m.searches.length > 0 || m.found.length > 0 || m.exhausted) ||
    Boolean(legacyDiscussion) ||
    structuredSources.length > 0;

  if (!hasContractActivity && !hasLegacyActivity) return null;

  const allRaw = structuredSources.length > 0 ? structuredSources : legacyModels.flatMap((m) => m.found);
  const seen = new Set<string>();

  // Fix (Bug: L129): guard against empty deduped list crashing header calculations
  const dedup = allRaw.filter((s) => {
    if (!s.url) return false;
    const key = normaliseUrlForDedup(s.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const govSources = dedup.filter((s) => classifySource(s) === "gov");
  const courtSources = dedup.filter((s) => classifySource(s) === "court");
  const intlSources = dedup.filter((s) => classifySource(s) === "intl");
  const academicSources = dedup.filter((s) => classifySource(s) === "academic");
  const modeLabel = (() => {
    const raw = meta.researchMode || meta.mode;
    if (raw === "fast_research" || raw === "web_search" || raw === "web_research") return "Fast Research";
    if (raw === "deep_research") return "Deep Research";
    if (raw === "council") return "Council";
    if (raw === "normal") return "Drafting";
    if (typeof raw === "string") return raw.replace(/_/g, " ");
    return "Research";
  })();
  const sourceContractStatus = meta.sourceContract?.status
    ?? (meta.sourceContract?.passed === true ? "passed" : meta.sourceContract ? "failed" : undefined);

  const listedCount = dedup.length;
  const citedCount = meta.sourceContract?.finalUniqueCitedSources ?? meta.citationStatus?.finalUniqueCitedSources ?? 0;
  const requiredCount = meta.sourceContract?.requiredSources ?? 0;

  const rawWarnings = [
    meta.legacyFallbackUsed ? "This brief used a fallback path and may be thinner than a full sitting." : null,
    status === "provider_error"
      ? "The selected model couldn't finish this draft. Pick another model in the composer, or open Settings → Keys."
      : null,
    status === "failed" || meta.qualityGate?.passed === false || sourceContractStatus === "failed"
      ? listedCount > 0 && citedCount === 0
        ? `We found ${listedCount} sources but couldn't ground a brief in them. Send the motion again, or switch to Deep Research for a fuller sitting.`
        : "This brief didn't meet the citation bar after a repair pass. Open the sources below, then try again."
      : null,
    meta.qualityGate?.repairRequired === true && status !== "failed" ? "A repair pass ran; treat this as a working draft, not a sealed brief." : null,
    sourceContractStatus === "passed_with_source_gaps" ? "Completed with source gaps — useful, but not a full citation set." : null,
  ].filter(Boolean) as string[];
  const warningMessages = [...new Set(rawWarnings)];

  return (
    <div className="mb-3 rounded-lg border border-[var(--line)] bg-[var(--surface)]/80 p-3 text-xs text-[var(--ink)] shadow-sm" data-testid="persisted-pipeline">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[var(--slate)]">
        <Globe className="h-3.5 w-3.5" />
        <span className="font-medium">{modeLabel}</span>
        <StatusBadge status={status} />
        {/* Fix (Bug: L128): increase font size from 9px so it's legible */}
        {meta.runId && <span className="font-mono text-2xs opacity-60">{meta.runId}</span>}
        {dedup.length > 0 && (
          <span className="ml-auto flex gap-1.5 text-2xs font-semibold">
            {govSources.length > 0 && <span>GOV {govSources.length}</span>}
            {courtSources.length > 0 && <span>COURT {courtSources.length}</span>}
            {intlSources.length > 0 && <span>INTL {intlSources.length}</span>}
            {academicSources.length > 0 && <span>ACAD {academicSources.length}</span>}
          </span>
        )}
      </div>

      {warningMessages.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {warningMessages.map((message) => (
            <div
              key={message}
              className={cn(
                "rounded-md border px-2.5 py-2 text-xs font-medium",
                message.toLowerCase().includes("failed") || message.toLowerCase().includes("provider")
                  ? "border-red-400/40 bg-red-500/10 text-red-950 dark:text-red-100"
                  : "border-amber-400/40 bg-amber-500/10 text-amber-950 dark:text-amber-100",
              )}
            >
              {message}
            </div>
          ))}
        </div>
      )}

      {(meta.sourceContract || meta.sourceGapReport || meta.qualityGate || meta.citationStatus) && (
        // Fix (Bug: L157): use grid-cols-1 on mobile (not sm:grid-cols-2 which squeezes single columns)
        <div className="mb-2 grid gap-1.5 rounded-md border border-[var(--line)] bg-[var(--surface)]/60 p-2 text-2xs text-[var(--slate)] sm:grid-cols-2">
          {meta.sourceContract && (
            <div>
              <span className="font-semibold text-[var(--ink)]">Sources used:</span>{" "}
              {citedCount} cited in the brief
              {listedCount > 0 ? ` · ${listedCount} listed` : ""}
              {requiredCount > 0 ? ` · target ${requiredCount}` : ""}
            </div>
          )}
          {meta.citationStatus && (
            <div>
              <span className="font-semibold text-[var(--ink)]">Citations:</span>{" "}
              {meta.citationStatus.finalUniqueCitedSources ?? 0} unique - {meta.citationStatus.totalLinkedCitations ?? 0} linked
            </div>
          )}
          {meta.qualityGate && (
            <div>
              <span className="font-semibold text-[var(--ink)]">Brief quality:</span>{" "}
              {meta.qualityGate.passed ? "ready for the floor" : "needs another pass"}
            </div>
          )}
          {meta.sourceGapReport && (
            <div className="text-amber-600 dark:text-amber-300 sm:col-span-2">
              <span className="font-semibold">Source gaps:</span> {sourceGapExplanation(meta)}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {legacyModels.map((m, idx) => {
          const isOpen = openModel === m.key;
          return (
            <div key={m.key} className="rounded-md border border-[var(--line)] bg-[var(--surface)]/60">
              <button
                type="button"
                onClick={() => setOpenModel(isOpen ? null : m.key)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--surface-muted)]/40"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-2xs font-bold", providerChipColor(m.key))}>
                    {m.label.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate font-medium">{m.label}</span>
                  {m.role ? (
                    <span className="rounded-full border border-[var(--line)]/50 bg-[var(--surface-muted)] px-1.5 py-0.5 text-2xs text-[var(--slate)]">
                      {m.role.replace(/[_-]+/g, " ").trim()}
                    </span>
                  ) : null}
                  {m.exhausted && (
                    <span className="inline-flex items-center gap-1 text-2xs text-amber-600 dark:text-amber-400">
                      <AlertCircle className="h-3 w-3" />
                      {/* Fix (Bug: L203): case-insensitive rate_limit check */}
                      {m.exhausted.reason?.toLowerCase() === "rate_limit" ? "rate limited" : "errored"}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[var(--slate)]">
                  {/* Fix (Bug: L221): use 1-based index but note it may differ from execution order */}
                  <span>{m.searches.length} searches - {m.found.length} sources</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
                </div>
              </button>

              {isOpen && (
                <div className="space-y-2 border-t border-[var(--line)] px-3 py-2">
                  {m.searches.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-2xs uppercase tracking-wide text-[var(--slate)]">Research Queries</div>
                      <div className="flex flex-wrap gap-1.5">
                        {m.searches.map((q, i) => (
                          <span key={`${q}-${i}`} className="rounded-full border border-slate-300/30 bg-slate-500/10 px-2 py-0.5 text-2xs text-slate-600 dark:text-slate-300">
                            {i + 1}. {q}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {m.found.length > 0 && (
                    <div>
                      <div className="mb-1 text-2xs uppercase tracking-wide text-[var(--slate)]">Sources found</div>
                      <ul className="space-y-0.5">
                        {m.found.slice(0, 12).map((f, i) => (
                          <li key={`${f.url}-${i}`} className="break-words [overflow-wrap:anywhere]">
                            <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                              {f.title || (f.url.length > 80 ? `${f.url.slice(0, 80)}…` : f.url)}
                            </a>
                          </li>
                        ))}
                        {m.found.length > 12 && (
                          <li className="text-2xs italic text-[var(--slate)]">
                            {m.found.length - 12} more
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {legacyDiscussion && (
        <div className="mt-2 rounded-md border border-[var(--line)] bg-[var(--surface)]/60">
          <button
            type="button"
            onClick={() => setShowDiscussion((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--surface-muted)]/40"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-amber-500" />
              <span className="font-medium">Cross-model comparison</span>
            </div>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showDiscussion && "rotate-180")} />
          </button>
          {showDiscussion && (
            // Fix (Bug: L251): add horizontal padding so text doesn't press against border
            <div className="prose prose-sm max-w-none border-t border-[var(--line)] px-4 py-3 dark:prose-invert">
              <div className="whitespace-pre-wrap">{legacyDiscussion}</div>
            </div>
          )}
        </div>
      )}

      {dedup.length > 0 && (
        <div className="mt-2 rounded-md border border-[var(--line)] bg-[var(--surface)]/60">
          <button
            type="button"
            onClick={() => setShowSources((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--surface-muted)]/40"
          >
            <span className="font-medium">All sources ({dedup.length})</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showSources && "rotate-180")} />
          </button>
          {showSources && (
            <ol className="list-inside list-decimal space-y-1 border-t border-[var(--line)] px-3 py-2">
              {dedup.map((s, i) => (
                <li key={`${s.url}-${i}`} className="break-words [overflow-wrap:anywhere]">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {/* Fix (Bug: L285): truncate very long URL-as-title fallbacks */}
                    {s.title || (s.url.length > 100 ? `${s.url.slice(0, 100)}…` : s.url)}
                  </a>
                  {s.sourceType && <span className="ml-1 text-2xs text-[var(--slate)]">({s.sourceType.replace(/_/g, " ")})</span>}
                  {"cited" in s && s.cited && (
                    // Fix (Bug: L290): use theme-aware colors for light mode compatibility
                    <span className="ml-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-2xs text-emerald-700 dark:text-emerald-200">
                      cited
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

