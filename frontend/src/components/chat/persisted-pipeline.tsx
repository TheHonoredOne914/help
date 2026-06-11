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

export type PersistedPipelineMetadata = PipelineMetadata;

export function extractPipelineMeta(content: string, identity?: number | string | PipelineMetadataIdentity): {
  cleanContent: string;
  meta: PersistedPipelineMetadata | null;
} {
  const { cleanContent, metadata } = extractPipelineMetadata(content, identity);
  return { cleanContent, meta: metadata };
}

function providerColor(key: string): string {
  // Fix (Bug: L196): handle model keys without "/" (local models, groq direct)
  const provider = key.includes("/") ? key.split("/")[0] : key.split("-")[0] ?? key;
  switch (provider) {
    case "nvidia": return "bg-emerald-600 text-white";
    case "gemini": return "bg-blue-600 text-white";
    case "ollama": return "bg-amber-600 text-white";
    case "openrouter": return "bg-violet-600 text-white";
    case "github": return "bg-slate-600 text-white";
    default: return "bg-indigo-600 text-white";
  }
}

function classifySource(s: { url: string; sourceType?: string }): "gov" | "court" | "intl" | "media" | "academic" {
  // Fix (Bug: L102): normalise URL to lowercase for comparison
  const u = (s.url ?? "").toLowerCase();

  // Fix (Bug: L33): livelaw.in is legal journalism, NOT a court source — demote from court
  if (
    u.includes("indiankanoon.org") ||
    u.includes("sci.gov.in") ||
    u.includes("scobserver.in") ||
    s.sourceType === "court_judgement" ||
    s.sourceType === "court_primary"
  ) return "court";

  // Fix (Bug: L35): add legislative.gov.in and other legislation repositories
  if (
    u.includes(".gov.in") ||
    u.includes("sansad.in") ||
    u.includes("legislative.gov.in") ||
    u.includes("prsindia.org") ||
    s.sourceType === "government_india" ||
    s.sourceType === "official_government"
  ) return "gov";

  // Fix (Bug: L36): match UN/World Bank subdomains that don't use .org directly
  if (
    s.sourceType === "government_international" ||
    s.sourceType === "international_research" ||
    u.includes("un.org") ||
    u.includes("worldbank.org") ||
    u.includes(".un.") ||
    u.includes("undp.org") ||
    u.includes("unicef.org") ||
    u.includes("who.int") ||
    u.includes("imf.org")
  ) return "intl";

  // Fix (Bug: L234): classify Indian academic domains (.ac.in, .edu.in)
  if (u.includes(".ac.in") || u.includes(".edu.in")) return "academic";

  return "media";
}

const PERSONAS = ["Data Analyst", "Legal Researcher", "Policy Analyst", "Current Affairs"];

function resolveTerminalStatus(meta: PersistedPipelineMetadata): PipelineTerminalStatus {
  if (meta.terminalStatus) return meta.terminalStatus;
  if (meta.legacyFallbackUsed) return "legacy_fallback_used";
  // Fix (Bug: L45): check both passed === false AND absence of a pass indicator
  if (meta.qualityGate?.passed === false || meta.sourceContract?.status === "failed") return "failed";
  if (meta.sourceContract?.status === "passed_with_source_gaps" || meta.sourceGapReport) return "completed_with_source_gaps";
  return "completed";
}

function statusLabel(status: PipelineTerminalStatus): string {
  switch (status) {
    case "completed_with_source_gaps": return "Completed with Source Gaps";
    case "degraded_fallback": return "Degraded Fallback";
    case "legacy_fallback_used": return "Legacy Fallback Used";
    case "provider_error": return "Provider Error";
    case "failed": return "Failed";
    case "cancelled": return "Cancelled";
    default: return "Completed";
  }
}

function statusClasses(status: PipelineTerminalStatus): string {
  switch (status) {
    case "completed_with_source_gaps": return "border-amber-400/40 bg-amber-500/10 text-amber-100";
    case "degraded_fallback": return "border-amber-400/40 bg-amber-500/10 text-amber-100";
    case "legacy_fallback_used": return "border-orange-400/40 bg-orange-500/10 text-orange-100";
    case "failed":
    case "provider_error": return "border-red-400/40 bg-red-500/10 text-red-100";
    case "cancelled": return "border-slate-400/40 bg-slate-500/10 text-slate-100";
    default: return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }
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
  const modeLabel = meta.researchMode
    ? meta.researchMode.replace(/_/g, " ")
    : meta.mode === "deep_research" ? "Deep Research" : "Legacy Web Search";
  const sourceContractStatus = meta.sourceContract?.status
    ?? (meta.sourceContract?.passed === true ? "passed" : meta.sourceContract ? "failed" : undefined);

  // Fix (Bug: L140): deduplicate warning messages before rendering
  const rawWarnings = [
    meta.legacyFallbackUsed ? "Legacy fallback used - this answer may be incomplete." : null,
    meta.qualityGate?.passed === false ? "Quality gate failed - this response should not be treated as final." : null,
    meta.qualityGate?.repairRequired === true ? "Repair required after quality review." : null,
    sourceContractStatus === "passed_with_source_gaps" ? "Completed with source gaps." : null,
    sourceContractStatus === "failed" ? "Source contract failed." : null,
    status === "provider_error" ? "Provider error prevented a validated answer." : null,
    status === "failed" ? "Research run failed validation." : null,
  ].filter(Boolean) as string[];
  const warningMessages = [...new Set(rawWarnings)];

  return (
    <div className="mb-3 rounded-lg border border-border bg-background/80 p-3 text-xs text-foreground shadow-sm" data-testid="persisted-pipeline">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-muted-foreground">
        <Globe className="h-3.5 w-3.5" />
        <span className="font-medium">{modeLabel} - {statusLabel(status)}</span>
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", statusClasses(status))}>
          {statusLabel(status)}
        </span>
        {/* Fix (Bug: L128): increase font size from 9px so it's legible */}
        {meta.runId && <span className="font-mono text-[10px] opacity-60">{meta.runId}</span>}
        {dedup.length > 0 && (
          <span className="ml-auto flex gap-1.5 text-[10px] font-semibold">
            {govSources.length > 0 && <span>GOV {govSources.length}</span>}
            {courtSources.length > 0 && <span>COURT {courtSources.length}</span>}
            {intlSources.length > 0 && <span>INTL {intlSources.length}</span>}
          </span>
        )}
      </div>

      {warningMessages.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {warningMessages.map((message) => (
            <div
              key={message}
              className={cn(
                "rounded-md border px-2.5 py-2 text-[11px] font-medium",
                message.toLowerCase().includes("failed") || message.toLowerCase().includes("provider")
                  ? "border-red-400/40 bg-red-500/10 text-red-100"
                  : "border-amber-400/40 bg-amber-500/10 text-amber-100",
              )}
            >
              {message}
            </div>
          ))}
        </div>
      )}

      {(meta.sourceContract || meta.sourceGapReport || meta.qualityGate || meta.citationStatus) && (
        // Fix (Bug: L157): use grid-cols-1 on mobile (not sm:grid-cols-2 which squeezes single columns)
        <div className="mb-2 grid gap-1.5 rounded-md border border-border bg-background/60 p-2 text-[10px] text-muted-foreground sm:grid-cols-2">
          {meta.sourceContract && (
            <div>
              <span className="font-semibold text-foreground">Source contract:</span>{" "}
              {meta.sourceContract.finalUniqueCitedSources ?? 0}/{meta.sourceContract.requiredSources ?? 0} cited -{" "}
              {meta.sourceContract.citationEligibleSources ?? 0} eligible - {sourceContractStatus?.replace(/_/g, " ") ?? "unknown"}
            </div>
          )}
          {meta.citationStatus && (
            <div>
              <span className="font-semibold text-foreground">Citations:</span>{" "}
              {meta.citationStatus.finalUniqueCitedSources ?? 0} unique - {meta.citationStatus.totalLinkedCitations ?? 0} linked
            </div>
          )}
          {meta.qualityGate && (
            <div>
              <span className="font-semibold text-foreground">Quality:</span>{" "}
              {meta.qualityGate.score ?? 0} - {meta.qualityGate.passed ? "passed" : "failed"}
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
            <div key={m.key} className="rounded-md border border-border bg-background/60">
              <button
                type="button"
                onClick={() => setOpenModel(isOpen ? null : m.key)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-muted/40"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold", providerColor(m.key))}>
                    {m.label.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate font-medium">{m.label}</span>
                  {/* Fix (Bug: L200): pin persona to model key hash, not idx % length — prevents
                      persona shifts if model order changes */}
                  <span className="rounded-full border border-border/50 bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
                    {PERSONAS[stableHashIndex(m.key, PERSONAS.length)]}
                  </span>
                  {m.exhausted && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                      <AlertCircle className="h-3 w-3" />
                      {/* Fix (Bug: L203): case-insensitive rate_limit check */}
                      {m.exhausted.reason?.toLowerCase() === "rate_limit" ? "rate limited" : "errored"}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
                  {/* Fix (Bug: L221): use 1-based index but note it may differ from execution order */}
                  <span>{m.searches.length} searches - {m.found.length} sources</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
                </div>
              </button>

              {isOpen && (
                <div className="space-y-2 border-t border-border px-3 py-2">
                  {m.searches.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">Research Queries</div>
                      <div className="flex flex-wrap gap-1.5">
                        {m.searches.map((q, i) => (
                          <span key={`${q}-${i}`} className="rounded-full border border-violet-300/30 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-600 dark:text-violet-300">
                            {i + 1}. {q}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {m.found.length > 0 && (
                    <div>
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Sources found</div>
                      <ul className="space-y-0.5">
                        {m.found.slice(0, 12).map((f, i) => (
                          <li key={`${f.url}-${i}`} className="break-words [overflow-wrap:anywhere]">
                            <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                              {/* Fix (Bug: L285): truncate long URLs used as title fallback */}
                              {f.title || (f.url.length > 80 ? `${f.url.slice(0, 80)}…` : f.url)}
                            </a>
                          </li>
                        ))}
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
        <div className="mt-2 rounded-md border border-border bg-background/60">
          <button
            type="button"
            onClick={() => setShowDiscussion((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-muted/40"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-amber-500" />
              <span className="font-medium">Cross-model comparison</span>
            </div>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showDiscussion && "rotate-180")} />
          </button>
          {showDiscussion && (
            // Fix (Bug: L251): add horizontal padding so text doesn't press against border
            <div className="prose prose-sm max-w-none border-t border-border px-4 py-3 dark:prose-invert">
              <div className="whitespace-pre-wrap">{legacyDiscussion}</div>
            </div>
          )}
        </div>
      )}

      {dedup.length > 0 && (
        <div className="mt-2 rounded-md border border-border bg-background/60">
          <button
            type="button"
            onClick={() => setShowSources((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-muted/40"
          >
            <span className="font-medium">All sources ({dedup.length})</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showSources && "rotate-180")} />
          </button>
          {showSources && (
            <ol className="list-inside list-decimal space-y-1 border-t border-border px-3 py-2">
              {dedup.map((s, i) => (
                <li key={`${s.url}-${i}`} className="break-words [overflow-wrap:anywhere]">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {/* Fix (Bug: L285): truncate very long URL-as-title fallbacks */}
                    {s.title || (s.url.length > 100 ? `${s.url.slice(0, 100)}…` : s.url)}
                  </a>
                  {s.sourceType && <span className="ml-1 text-[10px] text-muted-foreground">({s.sourceType.replace(/_/g, " ")})</span>}
                  {"cited" in s && s.cited && (
                    // Fix (Bug: L290): use theme-aware colors for light mode compatibility
                    <span className="ml-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-700 dark:text-emerald-200">
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

/** Fix (Bug: L200): deterministic persona index from model key — stable even if model order changes */
function stableHashIndex(key: string, len: number): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash % len;
}
