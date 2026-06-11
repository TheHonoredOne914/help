export interface PromptBudgetReportSummary {
  providerName?: string;
  model?: string;
  estimatedInputTokens?: number;
  maxInputTokens?: number;
  originalSources?: number;
  includedSources?: number;
  originalPacks?: number;
  includedPacks?: number;
  compressionApplied?: boolean;
  compressionLevel?: number;
  truncatedSections?: string[];
}

interface PromptBudgetPanelProps {
  report?: PromptBudgetReportSummary | null;
}

export function PromptBudgetPanel({ report }: PromptBudgetPanelProps) {
  if (!report) return null;

  return (
    <div className="rounded-lg border border-border/40 bg-background/70 p-2.5">
      <p className="text-[10px] font-semibold text-muted-foreground">Prompt Budget</p>
      <p className="mt-1 truncate text-[12px] font-semibold text-foreground">
        {(report.providerName ?? "provider")}/{report.model ?? "model"}
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {report.estimatedInputTokens ?? 0}/{report.maxInputTokens ?? 0} tokens
        {report.compressionApplied ? `, compression ${report.compressionLevel ?? 1}` : ""}
      </p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        Sources {report.includedSources ?? 0}/{report.originalSources ?? 0}
        {typeof report.includedPacks === "number" ? `, packs ${report.includedPacks}/${report.originalPacks ?? 0}` : ""}
      </p>
      {report.truncatedSections?.length ? (
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
          Truncated: {report.truncatedSections.map((section) => section.replace(/_/g, " ")).join(", ")}
        </p>
      ) : null}
    </div>
  );
}

