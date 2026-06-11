import {
  AlertTriangle,
  Archive as ArchiveIcon,
  Bookmark,
  CheckCircle2,
  FileText,
  Landmark,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getPipelineTerminalStatusSemantics,
  type CitationStatusSummary,
  type CorePipelineEventSummary,
  type FoundResult,
  type FullSourceManifestSummary,
  type PipelineRunStatus,
  type ResearchModeStatus,
  type SourceContractStatus,
  type SourceGapReportSummary,
} from "@/hooks/use-pipeline-state";

export interface ResearchRunSidebarSummaryInput {
  activeArchiveName?: string | null;
  activeArchiveTopic?: string | null;
  activeArchiveAngles?: string[] | null;
  runStatus: PipelineRunStatus;
  selectedResearchMode?: ResearchModeStatus | null;
  corePipelineEvents: CorePipelineEventSummary[];
  fullSourceManifest?: FullSourceManifestSummary | null;
  // Fix (Bug: L54): accept customModelFound so sidebar shows live sources during streaming
  customModelFound?: Record<string, FoundResult[]>;
  citationStatus?: CitationStatusSummary | null;
  sourceContract?: SourceContractStatus | null;
  sourceGapReport?: SourceGapReportSummary | null;
  currentMode?: string | null;
  chatType?: string | null;
}

export interface ResearchRunSidebarSummary {
  archiveName: string;
  topic: string | null;
  angleCount: number;
  runStatus: PipelineRunStatus;
  statusLabel: string;
  statusSeverity: "success" | "warning" | "error" | "info";
  researchMode: string;
  totalSources: number;
  citedSources: number;
  linkedCitations: number;
  sourceTarget: number | null;
  latestEvents: string[];
  sources: Array<{ id: number; title: string; url: string; badge: string; sourceType: string; cited: boolean }>;
  gapText: string | null;
}

export function summarizeResearchRunSidebar(input: ResearchRunSidebarSummaryInput): ResearchRunSidebarSummary {
  const semantics = getPipelineTerminalStatusSemantics(input.runStatus);

  // Fix (Bug: L54): fall back to customModelFound when fullSourceManifest is not yet populated
  let sources = input.fullSourceManifest?.sources ?? [];
  if (sources.length === 0 && input.customModelFound) {
    const seen = new Set<string>();
    const liveResults: typeof sources = [];
    for (const results of Object.values(input.customModelFound)) {
      for (const r of results) {
        if (r.url && !seen.has(r.url)) {
          seen.add(r.url);
          liveResults.push({
            index: liveResults.length + 1,
            title: r.title || r.url,
            url: r.url,
            badge: r.engine ?? r.sourceType ?? "WEB",
            sourceType: r.sourceType ?? "web",
            score: 0,
            hasFullContent: false,
            contentPreview: "",
          });
        }
      }
    }
    sources = liveResults;
  }

  const citedIds = new Set(input.citationStatus?.citedSourceIds ?? []);

  // Fix (Bug: L56): only reverse once — do not double-reverse
  const latestEvents = input.corePipelineEvents
    .slice(-4)
    .map((event) => event.type.replace(/_/g, " "));

  return {
    archiveName: input.activeArchiveName || "Active Research",
    topic: input.activeArchiveTopic ?? null,
    angleCount: input.activeArchiveAngles?.length ?? 0,
    runStatus: input.runStatus,
    statusLabel: semantics.label,
    statusSeverity: semantics.severity,
    researchMode: (input.selectedResearchMode ?? "research").replace(/_/g, " "),
    totalSources: input.fullSourceManifest?.totalSources ?? sources.length,
    citedSources: input.citationStatus?.finalUniqueCitedSources ?? citedIds.size,
    linkedCitations: input.citationStatus?.totalLinkedCitations ?? 0,
    sourceTarget: input.sourceContract?.requiredUniqueCitedSources ?? input.sourceGapReport?.requiredUniqueSources ?? null,
    latestEvents,
    // Fix (Bug: L74): show up to 20 sources (was 6), let the sidebar scroll
    sources: sources.slice(0, 20).map((source, index) => ({
      id: source.index ?? index + 1,
      title: source.title || source.url,
      url: source.url,
      // Fix (Bug: L78): only strip [] from the badge itself, not from the title
      badge: (source.badge ?? "").replace(/^\[|\]$/g, "") || source.sourceType?.replace(/_/g, " ") || "WEB",
      sourceType: source.sourceType ?? "web",
      cited: citedIds.has(source.index ?? index + 1),
    })),
    // Fix (Bug: L81): always provide fallback text when explanation is missing
    gapText: input.sourceGapReport?.explanation || (input.sourceGapReport ? "Targets not met." : null),
  };
}

export function ResearchRunSidebar({ summary, onClose }: { summary: ResearchRunSidebarSummary; onClose?: () => void }) {
  // Fix (Bug: L90): only spin when status is actually "running", not repairing or idle
  const isSpinning = summary.runStatus === "running";
  const statusIcon = summary.statusSeverity === "error"
    ? AlertTriangle
    : summary.statusSeverity === "success"
      ? CheckCircle2
      : isSpinning
        ? Loader2
        : AlertTriangle;
  const StatusIcon = statusIcon;

  return (
    // Fix (Bug: L96): use relative positioning on smaller screens (not absolute) to avoid overlap
    <aside className="welcome-intel-sidebar relative lg:absolute inset-y-0 right-0 z-10 flex w-full lg:w-[344px] flex-col border-l border-border/40 bg-background/96 px-4 py-4 shadow-[inset_1px_0_0_rgba(59,111,212,0.08)] backdrop-blur-xl lg:flex">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <section className="welcome-intel-section">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Live Research Run
              </p>
              {/* Fix (Bug: L104): use text-ellipsis with title tooltip for full name */}
              <p
                className="mt-1 truncate text-[11px] text-muted-foreground/70"
                title={summary.archiveName}
              >
                {summary.archiveName}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold",
                summary.statusSeverity === "success" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                summary.statusSeverity === "warning" && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                summary.statusSeverity === "error" && "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
                summary.statusSeverity === "info" && "border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-200",
              )}>
                <StatusIcon className={cn("h-3 w-3", isSpinning && "animate-spin")} />
                {summary.statusLabel}
              </span>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/50 bg-background/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Close live research run"
                  data-testid="button-close-live-research"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Fix (Bug: L121): use min-w-0 and truncate to prevent 3-digit numbers from wrapping */}
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <MetricCard label="Sources" value={String(summary.totalSources)} />
            <MetricCard label="Cited" value={String(summary.citedSources)} />
            <MetricCard label="Links" value={String(summary.linkedCitations)} />
          </div>

          <div className="mt-3 rounded-lg border border-border/30 bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Mode</p>
            <p className="mt-1 text-[12px] font-semibold capitalize text-foreground">{summary.researchMode}</p>
            {summary.sourceTarget != null && (
              <p className="mt-1 text-[10px] text-muted-foreground">Target: {summary.sourceTarget} unique cited sources</p>
            )}
            {summary.gapText && (
              // Fix (Bug: L130): add expand toggle for long gap text
              <details className="mt-2">
                <summary className="cursor-pointer text-[10px] font-semibold text-amber-700 dark:text-amber-400">Show gap details</summary>
                <p className="mt-1 text-[10px] leading-4 text-amber-700/80 dark:text-amber-200/80">{summary.gapText}</p>
              </details>
            )}
          </div>
        </section>

        {summary.topic && (
          <section className="mt-4 rounded-lg border border-border/30 border-t-amber-500/40 bg-muted/30 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Landmark className="h-3.5 w-3.5 text-amber-500" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-500">Active Brief</p>
            </div>
            <p className="line-clamp-3 text-[11px] leading-5 text-muted-foreground">{summary.topic}</p>
            {/* Fix (Bug: L143): handle 0 angles gracefully */}
            {summary.angleCount > 0 && (
              <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                {summary.angleCount} research {summary.angleCount === 1 ? "angle" : "angles"} pinned
              </p>
            )}
          </section>
        )}

        <section className="mt-4 welcome-intel-section">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Evidence Registry
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                {summary.totalSources > 0
                  ? `${summary.totalSources} sources — ${summary.citedSources} cited`
                  : "Retrieving sources…"}
              </p>
            </div>
            <ArchiveIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>

          {summary.sources.length > 0 ? (
            <div className="mt-3 max-h-[280px] space-y-1.5 overflow-y-auto pr-1">
              {summary.sources.map((source) => (
                <a
                  key={`${source.id}-${source.url}`}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-2 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-border/30 hover:bg-muted/30"
                >
                  {/* Fix (Bug: L178): show sourceType badge AND cited badge separately */}
                  <div className="mt-0.5 flex shrink-0 flex-col gap-0.5">
                    <span className={cn(
                      "rounded px-1.5 py-0.5 font-mono text-[9px] font-bold",
                      source.cited
                        ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border border-border/30 bg-muted/40 text-muted-foreground",
                    )}>
                      {source.cited ? "CITED" : source.badge}
                    </span>
                    {source.cited && source.badge && source.badge !== "WEB" && (
                      <span className="rounded px-1 py-0.5 font-mono text-[8px] border border-border/20 bg-muted/30 text-muted-foreground">
                        {source.badge}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-foreground">{source.title}</p>
                    {/* Fix (Bug: L186): show only primary domain, not full subdomain */}
                    <p className="truncate text-[10px] text-muted-foreground">{primaryDomain(source.url)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 pt-0.5 text-muted-foreground">
                    <FileText className="h-3.5 w-3.5 group-hover:text-foreground/70 transition-colors" />
                    {source.cited && <Bookmark className="h-3.5 w-3.5 group-hover:text-foreground/70 transition-colors" />}
                  </div>
                </a>
              ))}
            </div>
          ) : (
            // Fix (Bug: L196): improve contrast for empty state text
            <div className="mt-3 rounded-lg border border-border/30 bg-muted/20 px-3 py-3 text-[11px] leading-5 text-muted-foreground">
              Sources will appear here after retrieval emits a live manifest.
            </div>
          )}
        </section>

        {summary.latestEvents.length > 0 && (
          <section className="mt-4 rounded-lg border border-border/30 bg-muted/20 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Latest Checks</p>
            <div className="mt-2 space-y-1">
              {summary.latestEvents.map((event, i) => (
                <p key={`${event}-${i}`} className="truncate text-[10px] text-muted-foreground">{event}</p>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/30 bg-muted/20 px-2 py-2">
      {/* Fix (Bug: L121): use tabular-nums and shrink text for large values */}
      <p className="font-mono text-[13px] font-semibold tabular-nums text-foreground leading-none truncate">{value}</p>
      <p className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
    </div>
  );
}

// Fix (Bug: L186): return only the registrable domain (drop subdomains)
function primaryDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    // Return at most two levels: "nic.in" from "delhihighcourt.nic.in"
    const parts = hostname.split(".");
    if (parts.length > 2) return parts.slice(-2).join(".");
    return hostname;
  } catch {
    // Fix (Bug: L226): on invalid URL, truncate to prevent layout overflow
    return url.length > 40 ? `${url.slice(0, 40)}…` : url;
  }
}
