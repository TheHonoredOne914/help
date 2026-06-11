import { cn } from "@/lib/utils";
import type { EvidenceRegistrySummary } from "@/hooks/use-pipeline-state";

export interface SourcePanelResult {
  index?: number;
  title: string;
  url: string;
  sourceType?: string;
  excerpt?: string;
  badge?: string;
  hasFullContent?: boolean;
  score?: number;
  judgement?: {
    caseName: string;
    year: string;
    court: string;
    held?: string;
  } | null;
}

interface SourcePanelProps {
  results: SourcePanelResult[];
  usedSourceIds?: Set<number>;
  answerText?: string;
  evidenceSummary?: EvidenceRegistrySummary | null;
}

export function extractCitedIndices(answerText: string): Set<number> {
  const cited = new Set<number>();
  // Fix (Bug: source-panel L29): case-insensitive match, footnote [^N], comma-separated groups
  const re = /\[(?:[Ss]ource\s*)?(\d+(?:\s*,\s*\d+)*)\]|\[\^(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(answerText)) !== null) {
    const group = m[1] ?? m[2];
    for (const value of group.split(",")) {
      const parsed = parseInt(value.trim(), 10);
      if (Number.isFinite(parsed)) cited.add(parsed);
    }
  }
  return cited;
}

export function sourceBadge(sourceType?: string): string {
  switch (sourceType) {
    case "government_india":
    case "official_government":
      return "GOV";
    case "parliamentary_records":
      return "PARL";
    case "court_judgement":
    case "court_primary":
      return "COURT";
    case "legal_commentary":
      return "LEGAL";
    case "electoral_body":
      return "ECI";
    case "democracy_index":
      return "INDEX";
    case "human_rights_watchdog":
    case "civic_space_monitor":
      return "WATCH";
    case "digital_rights_watchdog":
      return "RIGHTS";
    case "press_freedom_index":
      return "PRESS";
    case "academic_india":
    case "academic_journal":
      return "ACAD";
    case "indian_major_media":
      return "MEDIA";
    case "policy_research":
      return "POLICY";
    case "comparative_democracy":
    case "government_international":
    case "international_research":
      return "INTL";
    case "social_media":
      return "SOCIAL";
    case "low_quality":
      return "LOW";
    case "general_media":
    default:
      return "WEB";
  }
}

export function inferTier(result: SourcePanelResult): "tier1" | "tier2" | "tier3" | "tier4" | "tier5" | "untiered" {
  const url = result.url.toLowerCase();
  if (result.sourceType === "court_primary" || result.sourceType === "court_judgement" || url.includes("indiankanoon.org") || url.includes("sci.gov.in")) return "tier1";
  if (
    result.sourceType === "official_government"
    || result.sourceType === "parliamentary_records"
    || result.sourceType === "electoral_body"
    || url.includes("cag.gov.in")
    || url.includes("ncrb.gov.in")
    || url.includes("pib.gov.in")
    || url.includes("prsindia.org")
    || url.includes("sansad.in")
  ) return "tier2";
  if (url.includes("rbi.org.in") || url.includes("niti.gov.in") || url.includes("mospi.gov.in") || url.includes("censusindia.gov.in")) return "tier3";
  if (result.sourceType === "academic_journal" || result.sourceType === "legal_commentary" || result.sourceType === "policy_research" || url.includes("epw.in") || url.includes("idsa.in") || url.includes("cprindia.org") || url.includes("orfonline.org")) return "tier4";
  if (result.sourceType === "comparative_democracy" || result.sourceType === "government_international" || result.sourceType === "international_research") return "tier5";
  return "untiered";
}

function tierLabel(tier: ReturnType<typeof inferTier>): string {
  switch (tier) {
    case "tier1": return "Tier 1";
    case "tier2": return "Tier 2";
    case "tier3": return "Tier 3";
    case "tier4": return "Tier 4";
    case "tier5": return "Tier 5";
    default: return "Untiered";
  }
}

function tierClass(tier: ReturnType<typeof inferTier>): string {
  switch (tier) {
    case "tier1": return "border-amber-500/50";
    case "tier2": return "border-[#3b6fd4]/45";
    case "tier3": return "border-[#3b6fd4]/35";
    case "tier4": return "border-[#3b6fd4]/30";
    case "tier5": return "border-slate-500/35";
    default: return "border-border/30";
  }
}

export function SourcePanel({ results, usedSourceIds, answerText = "", evidenceSummary = null }: SourcePanelProps) {
  const cited = usedSourceIds ?? extractCitedIndices(answerText);

  // Fix (Bug: L79): use result.index (the actual source ID) for cited matching,
  // with a fallback to i+1 only when index is absent
  const citedCount = results.filter((result, i) => cited.has(result.index ?? i + 1)).length;

  if (results.length === 0) return null;

  return (
    // Fix (Bug: L111): replace hardcoded #0d0e12 bg with CSS theme variables
    <aside className="border-l border-border/40 bg-background/95 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground">Evidence Registry</p>
          {evidenceSummary && (
            <p className="text-[10px] text-muted-foreground/70">
              {evidenceSummary.courtJudgementCount} court, {evidenceSummary.snippetOnlyCount} snippet-only
            </p>
          )}
        </div>
        <span className="rounded-full border border-border/40 bg-muted/50 px-2 py-1 font-mono text-[10px] text-muted-foreground">
          {citedCount} of {results.length} sources cited
        </span>
      </div>
      <div className="space-y-2">
        {results.map((result, index) => {
          const sourceId = result.index ?? index + 1;
          const isCited = cited.has(sourceId);
          const tier = inferTier(result);

          // Fix (Bug: L103, L104): use result.hasFullContent flag directly rather than
          // computing from the deduped array length vs snippetOnlyCount, which causes index mismatches
          const snippetOnly = result.hasFullContent === false;

          let host = result.url;
          try { host = new URL(result.url).hostname.replace(/^www\./, ""); } catch {}

          return (
            <div key={`${result.url}-${index}`} className={cn("rounded-lg border bg-card p-2 transition-colors hover:bg-muted/30", tierClass(tier))}>
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium text-foreground">
                    [Source {sourceId}] {result.title || host}
                  </p>
                  <a href={result.url} target="_blank" rel="noopener noreferrer" className="block truncate text-[10px] text-muted-foreground hover:text-foreground">
                    {host}
                  </a>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {isCited ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">
                      CITED
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400">
                      UNUSED
                    </span>
                  )}
                  {/* Fix (Bug: L178 equivalent): always show source type badge, even when cited */}
                  <span className={cn(
                    "text-[9px] font-bold px-1.5 py-0.5 rounded border",
                    "border-border/40 bg-muted/40 text-muted-foreground"
                  )}>
                    {result.badge?.replace(/[\[\]]/g, "") || sourceBadge(result.sourceType)}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded border border-border/30 px-1 text-[10px] font-mono text-muted-foreground">{tierLabel(tier)}</span>
                {(result.sourceType === "court_judgement" || result.sourceType === "court_primary") && (
                  <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1 text-[9px] font-mono text-amber-300">COURT</span>
                )}
                {result.hasFullContent && (
                  <span className="rounded border border-green-500/30 bg-green-500/10 px-1 text-[9px] font-mono text-green-300">FULL</span>
                )}
                {snippetOnly && (
                  <span title="Only a short search snippet was available, so cite this source for title or position only." className="rounded border border-yellow-500/30 bg-yellow-500/10 px-1 text-[9px] font-mono text-yellow-300">
                    SNIPPET
                  </span>
                )}
                {/* Fix (Bug: L900 score): show relevance score when available */}
                {typeof result.score === "number" && result.score > 0 && (
                  <span className="rounded border border-border/30 px-1 text-[9px] font-mono text-muted-foreground" title="Relevance score">
                    ★ {result.score.toFixed(2)}
                  </span>
                )}
              </div>
              {result.judgement && (
                <p className="mt-2 text-[10px] leading-snug text-amber-100/80">
                  {result.judgement.caseName} ({result.judgement.year}, {result.judgement.court})
                </p>
              )}
              {result.excerpt && (
                <details className="mt-2 font-mono text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer text-foreground/70">Passage excerpt</summary>
                  <p className="mt-1 whitespace-pre-wrap">{result.excerpt.slice(0, 200)}{result.excerpt.length > 200 ? "..." : ""}</p>
                </details>
              )}
            </div>
          );
        })}
      </div>
      {evidenceSummary?.evidenceGaps?.length ? (
        <div className="mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-2">
          <p className="mb-1 text-[10px] font-semibold text-yellow-300">Warning: What's Missing</p>
          <ul className="space-y-1">
            {evidenceSummary.evidenceGaps.map((gap, index) => (
              <li key={index} className="text-[10px] leading-snug text-yellow-100/80">{gap}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
