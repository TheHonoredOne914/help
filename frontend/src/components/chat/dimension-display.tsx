import { Activity } from "lucide-react";
import type { DimensionScore } from "@/hooks/use-pipeline-state";
import { cn } from "@/lib/utils";

interface DimensionDisplayProps {
  scores: DimensionScore[] | null;
  agendaClass: string | null;
  committeeType: string | null;
  collapsed?: boolean;
}

const LABELS: Record<string, string> = {
  political: "Political",
  constitutional: "Constitutional",
  economic: "Economic",
  security: "Security",
  human_rights: "Human Rights",
  judiciary: "Judiciary",
  diplomatic: "Diplomatic",
  technological: "Technology",
  electoral: "Electoral",
  media_information: "Media & Information",
  governance: "Governance",
  federalism: "Federalism",
  social_stability: "Social Stability",
  public_sentiment: "Public Sentiment",
  international_relations: "International Relations",
  strategic_affairs: "Strategic Affairs",
};

function pretty(value: string | null): string {
  if (!value) return "";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function barClass(score: DimensionScore): string {
  if (score.class === "core") return "bg-indigo-500";
  if (score.class === "secondary") return "bg-slate-500";
  return "bg-zinc-400";
}

export function DimensionDisplay({ scores, agendaClass, committeeType, collapsed = false }: DimensionDisplayProps) {
  if (!scores?.length && !agendaClass) return null;

  const primary = (scores ?? []).filter((score) => score.priority === "primary");
  const secondary = (scores ?? []).filter((score) => score.priority === "secondary");
  const maxScore = Math.max(1, ...((scores ?? []).map((score) => score.boostedScore)));

  if (collapsed) {
    return (
      // Fix (Bug: L1456): add dark mode variant for border
      <div className="mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-300/40 dark:border-slate-700/50 bg-background/90 px-3 py-2">
        <Activity className="h-3.5 w-3.5 text-indigo-500" />
        <span className="text-[11px] font-semibold text-foreground">{pretty(agendaClass) || "Agenda mapped"}</span>
        <span className="text-[10px] text-muted-foreground">{pretty(committeeType)}</span>
        {primary.slice(0, 4).map((score) => (
          <span key={score.name} className="rounded-full border border-slate-300/40 dark:border-slate-700/40 px-2 py-0.5 text-[10px] text-muted-foreground">
            {LABELS[score.name] ?? pretty(score.name)}
          </span>
        ))}
      </div>
    );
  }

  return (
    <section className="mx-4 mb-3 rounded-xl border border-slate-300/40 dark:border-slate-700/50 bg-background/95 p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-foreground">Dimension Engine</p>
          <p className="truncate text-[10px] text-muted-foreground">{pretty(committeeType) || "General"} committee profile</p>
        </div>
        {agendaClass && (
          <span className="shrink-0 rounded-full border border-indigo-300/40 bg-indigo-500/10 px-2 py-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
            {pretty(agendaClass)}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {primary.map((score) => (
          <div key={score.name} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-2 text-[11px]">
            <span className="truncate font-medium text-foreground">{LABELS[score.name] ?? pretty(score.name)}</span>
            {/* Fix (Bug: L86): use theme-aware bg colors, not hardcoded slate-200/800 */}
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500 ease-out",
                  barClass(score),
                )}
                // Fix (Bug: L89): start from 0 so transition animates from empty
                style={{ width: `${Math.max(8, (score.boostedScore / maxScore) * 100)}%` }}
              />
            </div>
            <span className="text-right font-mono text-[10px] text-muted-foreground">{score.boostedScore}</span>
          </div>
        ))}
      </div>

      {secondary.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {secondary.map((score) => (
            <span key={score.name} className="rounded-full border border-slate-300/40 dark:border-slate-700/40 px-2 py-0.5 text-[10px] text-muted-foreground">
              {LABELS[score.name] ?? pretty(score.name)} {score.boostedScore}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
