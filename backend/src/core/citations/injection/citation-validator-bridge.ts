import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";
import { validateCitations } from "../../verification/citation-validator.js";
import type { AgendaContract } from "../../agenda/agenda-contract.js";

export function validatePrepopulatedDivisionOutputs(
  outputs: Map<string, string>,
  registry: EvidenceRegistryCore,
  contract: AgendaContract
): Map<string, string> {
  const validated = new Map<string, string>();
  for (const [key, text] of outputs.entries()) {
    const report = validateCitations(text, registry, contract);
    // If the text contains invalid citations, we might strip them or just drop the text.
    // For now, we will drop invalid outputs to force re-generation or at least flag them.
    if (!report.passed && report.invalidCitations.length > 0) {
      // Clean up invalid citations or fallback to empty string
      const cleaned = report.invalidCitations.reduce((acc, citationStr) => {
        const idMatch = citationStr.match(/Source (\d+)/);
        if (idMatch) {
            return acc.replace(new RegExp(`\\[Source ${idMatch[1]}\\]\\([^)]+\\)`, 'g'), '');
        }
        return acc;
      }, text);
      validated.set(key, cleaned);
    } else {
      validated.set(key, text);
    }
  }
  return validated;
}
