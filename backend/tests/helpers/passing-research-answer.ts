import { RESEARCH_LIMITS, type ResearchMode } from "../../src/core/config/research-mode.js";
import { MODE_THRESHOLDS } from "../../src/core/quality-gate/mode-thresholds.js";
import type { EvidenceRegistryCore } from "../../src/core/evidence/evidence-registry.js";

export function buildPassingResearchAnswer(registry: EvidenceRegistryCore, mode: ResearchMode = "deep_research"): string {
  const citationCount = Math.min(registry.getCitationEligibleCount(), RESEARCH_LIMITS[mode].minFinalUniqueCitedSources);
  const citations = registry.getCitationEligibleSources()
    .slice(0, citationCount)
    .map((source) => registry.getCitationMarkdown(source.id))
    .join(" ");
  const minWords = MODE_THRESHOLDS[mode].finalAnswerMinWords;
  const maxWords = MODE_THRESHOLDS[mode].finalAnswerMaxWords;
  const targetWords = maxWords > 0 ? Math.min(maxWords - 150, minWords + 250) : minWords + 150;
  const filler = Array.from({ length: Math.max(0, Math.ceil((targetWords - 500) / 35)) }, (_, index) =>
    `Paragraph ${index + 1} grounds Treasury Bench accountability, Opposition rights scrutiny, Election Commission safeguards, Article 19 proportionality, committee oversight, and source-backed parliamentary strategy without overclaiming beyond the registry.`,
  ).join("\n\n");
  return [
    "# Executive Thesis",
    `Indian Mock Parliament thesis with Treasury Bench, Opposition, POIs, rebuttals, motions, amendments, central contradiction and strategic synthesis. ${citations}`,
    "## Methodology and Source Base",
    `Registry citations only. ${citations}`,
    "## Research Angle Map",
    "Treasury Bench, Opposition, courts, ministries, and Election Commission positions are separated with explicit source classes.",
    "## Indian Mock Parliament Debate Utility Arsenal",
    `Treasury Bench arguments and Opposition arguments use source-grounded POIs and rebuttals. Motions, amendments, operative clause, and preambular clause language are included. ${citations}`,
    filler,
    "## Final Strategic Synthesis",
    `Diagnosis: the central contradiction is proof versus rhetoric. Prescription: use source-backed floor pressure. Warning: do not overclaim. ${citations}`,
  ].join("\n\n");
}
