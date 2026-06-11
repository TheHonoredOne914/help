import type { ClaimType, RawClaimInput } from "./types.js";

export function classifyClaimType(input: RawClaimInput): ClaimType {
  if (input.suggestedType) return input.suggestedType;
  const text = input.text.toLowerCase();
  if (input.usageType === "legal_holding_extracted" || input.sourceClass === "court_primary" && /\bheld|ruled|judgment|doctrine|article\s+\d+\b/.test(text)) return "legal_holding";
  if (input.usageType === "number_extracted" && /\brank(?:ed)?\b/i.test(input.text)) return "rank";
  if (input.usageType === "number_extracted" || /\bscore(?:d)?\b|\b\d+(?:\.\d+)?\s?%|\bindex\b/i.test(input.text)) return "score";
  if (input.sourceClass === "official_government" || input.sourceClass === "electoral_body" || input.sourceClass === "parliamentary_records") return "official_position";
  if (/\balleg(?:e|ed|ation)|accused|claimed without|reportedly|purported\b/i.test(input.text)) return "allegation";
  if (/\bwill|likely|projected|forecast|may lead|could lead|expected to\b/i.test(input.text)) return "prediction";
  if (/\bincreased?|decreased?|declined?|rising|fell|trend|higher|lower|improved?|worsened?\b/i.test(input.text)) return "trend";
  if (/\bincident|violence|arrest|raid|attack|clash|detention\b/i.test(input.text)) return "incident";
  if (input.usageType === "used_for_debate_utility" || /\btreasury bench|opposition|poi|rebuttal|motion|amendment|floor strategy\b/i.test(input.text)) return "debate_argument";
  if (input.usageType === "challenges_claim") return "argument";
  if (/\bshould|must|therefore|because|argue|contention\b/i.test(input.text)) return "argument";
  if (/\bopinion|editorial|commentary|interpretation\b/i.test(input.text)) return "opinion";
  if (input.usageType === "fact_extracted" || input.usageType === "supports_claim") return "fact";
  return "interpretation";
}

export function carefulLanguageReason(type: ClaimType, text: string): string | undefined {
  if (type === "allegation") return "Allegations must be attributed and qualified.";
  if (type === "prediction") return "Predictions must not be stated as settled fact.";
  if (type === "legal_holding") return "Legal holdings require precise source-class support and careful wording.";
  if (/\bfraud|stolen|manipulat|illegal|unconstitutional|rights violation\b/i.test(text)) return "High-risk legal/electoral language requires careful attribution.";
  return undefined;
}
