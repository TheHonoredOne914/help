import { cn } from "@/lib/utils";
import type { EvidenceRegistrySummary } from "@/hooks/use-pipeline-state";
import { extractCitedIndices } from "@/lib/citation-indices";
import { hostFromUrl } from "@/lib/host-from-url";
import {
  getSourceBadge,
  inferSourceTier,
  sourceBadgeLabel,
  tierBorderClass,
} from "@/lib/source-semantics";

export interface SourcePanelResult {
  index?: number;
  sourceId?: number;
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

export { extractCitedIndices };

function tierLabel(tier: ReturnType<typeof inferSourceTier>): string {
  switch (tier) {
    case "tier1": return "Tier 1";
    case "tier2": return "Tier 2";
    case "tier3": return "Tier 3";
    case "tier4": return "Tier 4";
    case "tier5": return "Tier 5";
    default: return "Untiered";
  }
}

export function SourcePanel({ results, usedSourceIds, evidenceSummary = null }: SourcePanelProps) {
  const cited = usedSourceIds ?? new Set<number>();

  const citedCount = results.filter((result, i) => cited.has(result.sourceId ?? result.index ?? i + 1)).length;

  if (results.length === 0) return null;

  return (
    <aside className="border-l border-[var(--line)]/40 bg-[var(--surface)]/95 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-[var(--slate)]">Evidence Registry</p>
          {evidenceSummary && (
            <p className="text-2xs text-[var(--slate)]/70">
              {evidenceSummary.courtJudgementCount} court, {evidenceSummary.snippetOnlyCount} snippet-only
            </p>
          )}
        </div>
        <span className="rounded-full border border-[var(--line)]/40 bg-[var(--surface-muted)]/50 px-2 py-1 font-mono text-2xs text-[var(--slate)]">
          {citedCount} of {results.length} sources cited
        </span>
      </div>
      <div className="space-y-2">
        {results.map((result, index) => {
          const sourceId = result.sourceId ?? result.index ?? index + 1;
          const isCited = cited.has(sourceId);
          const tier = inferSourceTier(result);
          const snippetOnly = result.hasFullContent === false;
          const host = result.url ? hostFromUrl(result.url) : result.url;

          return (
            <div
              key={`${result.url}-${index}`}
              id={`source-row-${sourceId}`}
              className={cn("rounded-lg border bg-[var(--surface)] p-2 transition-colors hover:bg-[var(--surface-muted)]/30", tierBorderClass(tier))}
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--ink)]" title={result.title || host}>
                    [Source {sourceId}] {result.title || host}
                  </p>
                  <a href={result.url} target="_blank" rel="noopener noreferrer" className="block truncate text-2xs text-[var(--slate)] hover:text-[var(--ink)]" title={result.url}>
                    {host}
                  </a>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {isCited ? (
                      <span className="text-2xs font-bold px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--status-success)_12%,transparent)] text-[var(--status-success)] border border-[color-mix(in_srgb,var(--status-success)_30%,transparent)]">
                        CITED
                      </span>
                    ) : (
                      <span className="text-2xs font-bold px-1.5 py-0.5 rounded border border-[color-mix(in_srgb,var(--brass)_30%,transparent)] bg-[color-mix(in_srgb,var(--brass)_10%,transparent)] text-amber-700 dark:text-amber-400">
                        UNUSED
                      </span>
                  )}
                  <span className={cn(
                    "text-2xs font-bold px-1.5 py-0.5 rounded border",
                    "border-[var(--line)]/40 bg-[var(--surface-muted)]/40 text-[var(--slate)]"
                  )}>
                    {result.badge?.replace(/[\[\]]/g, "") || sourceBadgeLabel(result.sourceType)}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded border border-[var(--line)]/40 bg-[var(--surface-muted)]/50 px-1.5 py-0.5 font-mono text-2xs text-[var(--slate)]">
                  {tierLabel(tier)}
                </span>
                {snippetOnly && (
                  <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-2xs font-medium text-amber-700 dark:text-amber-400">
                    Snippet only
                  </span>
                )}
                {result.judgement && (
                  <span className="rounded border border-[color-mix(in_srgb,var(--brass)_30%,transparent)] bg-[color-mix(in_srgb,var(--brass)_8%,transparent)] px-1.5 py-0.5 text-2xs text-amber-700 dark:text-amber-400">
                    {result.judgement.caseName} ({result.judgement.year})
                  </span>
                )}
              </div>
              {result.excerpt && (
                <p className="mt-1.5 line-clamp-3 text-2xs leading-relaxed text-[var(--slate)]">
                  {result.excerpt}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
