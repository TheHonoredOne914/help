import type { EvidenceClaim } from "./types.js";
import type { SourceClass } from "../evidence-registry.js";

const LEGAL_CLASSES: SourceClass[] = ["court_primary", "legal_commentary"];
const STATISTICAL_CLASSES: SourceClass[] = ["democracy_index", "policy_research", "academic_journal", "comparative_democracy", "official_government", "electoral_body"];

export function requiredClassesForClaim(claim: Pick<EvidenceClaim, "type" | "sourceClasses">): SourceClass[] {
  if (claim.type === "legal_holding") return LEGAL_CLASSES;
  if (claim.type === "score" || claim.type === "rank" || claim.type === "trend") return STATISTICAL_CLASSES;
  return claim.sourceClasses?.length ? claim.sourceClasses : [];
}

export function validateClaimSourceClasses(claim: EvidenceClaim): EvidenceClaim {
  const required = requiredClassesForClaim(claim);
  if (required.length === 0) return claim;
  const actual = claim.sourceClasses ?? [];
  const matched = actual.some((sourceClass) => required.includes(sourceClass));
  if (matched) return { ...claim, requiredSourceClasses: required };
  return {
    ...claim,
    requiredSourceClasses: required,
    confidence: "low",
    supportScore: Math.min(claim.supportScore ?? 0, 35),
    mustUseCarefulLanguage: true,
    requiresCarefulLanguageReason: claim.requiresCarefulLanguageReason ?? `Claim type ${claim.type} lacks required source class support.`,
    limitations: [...(claim.limitations ?? []), `Required source class missing for ${claim.type}: ${required.join(", ")}`],
  };
}
