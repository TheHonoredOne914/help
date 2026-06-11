import type { AgendaContract } from "./agenda-contract.js";

export interface ArchiveSafetyReport {
  safe: boolean;
  overlapScore: number;
  driftRisk: "low" | "medium" | "high";
  excludedTerms: string[];
  reason: string;
  sanitizedArchiveText: string;
  archiveCanBeCited: boolean;
}

export function isArchiveContextSafeForAgenda(archiveText: string, contract: AgendaContract): ArchiveSafetyReport {
  const text = archiveText.trim();
  if (!text) {
    return { safe: true, overlapScore: 0, driftRisk: "low", excludedTerms: [], reason: "No archive context.", sanitizedArchiveText: "", archiveCanBeCited: false };
  }

  const lower = text.toLowerCase();
  const excludedTerms = contract.forbiddenDriftTerms.filter((term) => lower.includes(term.toLowerCase()));
  const entityHits = contract.requiredEntities.filter((entity) => lower.includes(entity.toLowerCase())).length;
  const lensHits = contract.requiredLenses.filter((lens) => lower.includes(lens.replace(/_/g, " "))).length;
  const overlapScore = Math.min(1, (entityHits + lensHits) / Math.max(8, contract.requiredEntities.length * 0.25));
  const hasUnMode = /\bunsc|un security council|general assembly|member states|un resolution\b/i.test(text);
  const previousModelOutput = /\b(previous answer|assistant:|model-generated|as an ai|i cannot browse)\b/i.test(text);
  // Only flag high drift if excluded terms make up a significant fraction of the archive
  const excludedTermDensity = excludedTerms.length > 0
    ? excludedTerms.reduce((sum, term) => sum + (lower.split(term.toLowerCase()).length - 1), 0)
    : 0;
  const totalWords = text.split(/\s+/).length;
  const driftTermFraction = totalWords > 0 ? excludedTermDensity / totalWords : 0;
  const driftRisk: ArchiveSafetyReport["driftRisk"] = (excludedTerms.length > 0 && driftTermFraction > 0.05) || hasUnMode
    ? "high"
    : excludedTerms.length > 0 || previousModelOutput || overlapScore < 0.2
      ? "medium"
      : "low";
  const safe = driftRisk !== "high" && overlapScore >= 0.15;

  return {
    safe,
    overlapScore,
    driftRisk,
    excludedTerms,
    reason: safe
      ? previousModelOutput
        ? "Archive overlaps the agenda but is model-generated, so it may only be background."
        : "Archive overlaps the current agenda and may be used as background."
      : "Archive context risks redefining the current user query.",
    sanitizedArchiveText: safe ? sanitizeArchiveText(text, contract) : "",
    archiveCanBeCited: false,
  };
}

function sanitizeArchiveText(text: string, contract: AgendaContract): string {
  const safeLines = text.split(/\n+/).filter((line) => {
    const lower = line.toLowerCase();
    if (contract.forbiddenDriftTerms.some((term) => lower.includes(term.toLowerCase()))) return false;
    if (/\bunsc|member states|un resolution|security council\b/i.test(line) && contract.committeeSystem === "indian_mock_parliament") return false;
    return true;
  });
  return safeLines.join("\n").slice(0, 2000);
}
