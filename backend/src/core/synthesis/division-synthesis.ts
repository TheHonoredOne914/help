import type { EvidenceCard } from "../evidence/evidence-pack-builder.js";
import { buildDebateUtilityDivision, buildStrategicInsightsDivision, validateD11StrategicInsights, validateD7DebateUtility } from "./division-quality.js";

export function synthesizeDivision(title: string, cards: EvidenceCard[], priorDivisions = new Map<string, string>()): string {
  if (/D7|debate utility/i.test(title)) {
    const output = buildDebateUtilityDivision({ agenda: title, cards });
    const validation = validateD7DebateUtility(output);
    return validation.passed ? output : `## ${title}\n\nSource gap.`;
  }

  if (/D11|strategic insights/i.test(title)) {
    const output = buildStrategicInsightsDivision({
      agenda: title,
      priorDivisions,
      sourceAnchors: cards.slice(0, 3).map((card) => card.citation),
    });
    const validation = validateD11StrategicInsights(output, priorDivisions);
    return validation.passed ? output : `## ${title}\n\nSource gap.`;
  }

  const citations = cards.slice(0, 5).map((card) => card.citation).join(" ");
  return `## ${title}\n\n${citations || "Source gap."}`;
}
