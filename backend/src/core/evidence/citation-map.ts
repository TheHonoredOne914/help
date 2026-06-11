import type { EvidenceRegistryCore } from "./evidence-registry.js";

export interface CitationMapItem {
  sourceId: number;
  label: string;
  markdown: string;
}

export function buildCitationMap(registry: EvidenceRegistryCore): CitationMapItem[] {
  return registry.getCitationEligibleSources().map((source) => ({
    sourceId: source.id,
    label: registry.getCitationLabel(source.id),
    markdown: registry.getCitationMarkdown(source.id),
  }));
}
