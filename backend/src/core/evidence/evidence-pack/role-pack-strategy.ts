import type { EvidenceCard, RolePackStrategy } from "./types.js";
import {
  CITATION_SAFE_CLASSES,
  DATA_BUCKETS,
  DATA_CLASSES,
  LEGAL_BUCKETS,
  LEGAL_CLASSES,
  POLICY_BUCKETS,
  POLICY_CLASSES,
  WATCHDOG_BUCKETS,
  safeDefaultStrategy,
} from "./role-bucket-preferences.js";

export function resolveRolePackStrategy(roleName: string): RolePackStrategy {
  const normalized = roleName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (/citation.*auditor|final_quality_auditor/.test(normalized)) {
    return {
      id: "citation_auditor",
      label: "Citation auditor",
      preferredBuckets: ["court_legal", "government_official", "parliamentary_records", "electoral_integrity", "policy_research", "academic_research"],
      preferredSourceClasses: CITATION_SAFE_CLASSES,
      preferCitationStrength: true,
      preferDiversity: true,
    };
  }
  if (/legal|judicial|constitutional/.test(normalized)) {
    return {
      id: "legal_strategist",
      label: "Legal strategist",
      preferredBuckets: LEGAL_BUCKETS,
      preferredSourceClasses: LEGAL_CLASSES,
      preferLegal: true,
      preferCitationStrength: true,
    };
  }
  if (/evidence.*extractor|data|statistic|number/.test(normalized)) {
    return {
      id: "evidence_extractor",
      label: "Evidence extractor",
      preferredBuckets: DATA_BUCKETS,
      preferredSourceClasses: DATA_CLASSES,
      preferNumbers: true,
      preferCitationStrength: true,
    };
  }
  if (/retrieval.*critic|source.*critic|gap/.test(normalized)) {
    return {
      id: "retrieval_critic",
      label: "Retrieval critic",
      preferredBuckets: ["government_official", "court_legal", "human_rights_watchdog", "civic_space", "digital_rights", "press_freedom", "policy_research", "indian_major_media"],
      preferredSourceClasses: ["official_government", "court_primary", "human_rights_watchdog", "civic_space_monitor", "digital_rights_watchdog", "press_freedom_index", "policy_research", "indian_major_media", "social_media", "low_quality"],
      includeWeakForCritique: true,
      preferDiversity: true,
    };
  }
  if (/policy|analyst/.test(normalized)) {
    return {
      id: "policy_analyst",
      label: "Policy analyst",
      preferredBuckets: POLICY_BUCKETS,
      preferredSourceClasses: POLICY_CLASSES,
      preferDiversity: true,
      secondaryBuckets: WATCHDOG_BUCKETS,
    };
  }
  if (/parliamentary|strategist|thesis|synthesizer|debate/.test(normalized)) {
    return {
      id: "strategic_synthesis",
      label: "Strategic synthesis",
      preferredBuckets: ["government_official", "parliamentary_records", "court_legal", "policy_research", "indian_major_media", "human_rights_watchdog", "electoral_integrity"],
      preferredSourceClasses: ["official_government", "parliamentary_records", "court_primary", "electoral_body", "policy_research", "indian_major_media", "human_rights_watchdog", "legal_commentary"],
      preferDiversity: true,
      preferCitationStrength: true,
    };
  }
  return safeDefaultStrategy(roleName);
}

export function scoreCardForRole(card: EvidenceCard, strategy: RolePackStrategy): number {
  let score = 0;
  if (card.bucketIds.some((bucketId) => strategy.preferredBuckets.includes(bucketId))) score += 18;
  if (card.bucketIds.some((bucketId) => strategy.secondaryBuckets?.includes(bucketId))) score += 8;
  if (strategy.preferredSourceClasses.includes(card.sourceClass)) score += 14;
  if (strategy.preferNumbers && card.keyNumbers.length > 0) score += 18;
  if (strategy.preferNumbers && card.topChunks.some((chunk) => /\b\d+(?:\.\d+)?%|\b20\d{2}\b|\b\d+(?:,\d{3})+\b/.test(chunk.text))) score += 8;
  if (strategy.preferLegal && (card.legalHoldings.length > 0 || card.bucketIds.includes("court_legal"))) score += 22;
  if (strategy.preferCitationStrength && card.citationStrength === "strong") score += 16;
  if (strategy.preferCitationStrength && card.citationStrength === "medium") score += 9;
  if (strategy.includeWeakForCritique && (card.limitedSource || card.citationStrength === "weak")) score += 18;
  if (!strategy.includeWeakForCritique && card.limitedSource) score -= 14;
  if (!strategy.includeWeakForCritique && card.citationStrength === "ineligible") score -= 40;
  return score;
}
