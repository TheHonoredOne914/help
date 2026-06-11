import type { EvidenceRegistrySummary } from "@/hooks/use-pipeline-state";
import { SourcePanel } from "../source-panel";

interface SourceListPanelProps {
  results: Array<{ title: string; url: string; engine?: string; sourceType?: string }>;
  usedSourceIds?: Set<number>;
  answerText: string;
  evidenceSummary?: EvidenceRegistrySummary | null;
}

export function SourceListPanel({ results, usedSourceIds, answerText, evidenceSummary }: SourceListPanelProps) {
  if (results.length === 0 && !evidenceSummary) return null;
  return (
    <SourcePanel
      results={results}
      usedSourceIds={usedSourceIds}
      answerText={answerText}
      evidenceSummary={evidenceSummary}
    />
  );
}

