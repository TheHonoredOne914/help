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
    <div className="rounded-lg border border-[var(--line)]/40 bg-[var(--surface)]/70 p-2.5">
      <p className="text-2xs font-semibold text-[var(--slate)]">Prompt Budget</p>
      <p className="mt-1 truncate text-sm font-semibold text-[var(--ink)]">
        {(report.providerName ?? "provider")}/{report.model ?? "model"}
      </p>
      <p className="mt-1 text-2xs text-[var(--slate)]">
        {report.estimatedInputTokens ?? 0}/{report.maxInputTokens ?? 0} tokens
        {report.compressionApplied ? `, compression ${report.compressionLevel ?? 1}` : ""}
      </p>
      <p className="mt-0.5 text-2xs text-[var(--slate)]">
        Sources {report.includedSources ?? 0}/{report.originalSources ?? 0}
        {typeof report.includedPacks === "number" ? `, packs ${report.includedPacks}/${report.originalPacks ?? 0}` : ""}
      </p>
      {report.truncatedSections?.length ? (
        <p className="mt-0.5 truncate text-2xs text-[var(--slate)]">
          Truncated: {report.truncatedSections.map((section) => section.replace(/_/g, " ")).join(", ")}
        </p>
      ) : null}
    </div>
  );
}

