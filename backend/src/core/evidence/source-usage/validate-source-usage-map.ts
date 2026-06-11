import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { EvidenceRegistryCore, EvidenceSource } from "../evidence-registry.js";
import { groundUsageItem } from "./claim-grounding.js";
import { isBoilerplateText } from "./evidence-span-matcher.js";
import { sourceUsageFailure, splitFailureMessages } from "./failure-reporting.js";
import { COUNTING_USAGE_TYPES, hasClaimContent, sourceEligibilityFailures, VALID_USAGE_TYPES, weakSourceWarning, canCountForStrictSourceUsage } from "./source-eligibility.js";
import { normalizeAllowedSourceIds, validateRoleSourceScope } from "./role-source-scope.js";
import type { ModelRoleOutput, SourceUsageMapItem, SourceUsageValidationOptions, SourceUsageValidationReport, StructuredSourceUsageFailure } from "./types.js";

export function validateSourceUsageMap(
  modelOutput: ModelRoleOutput,
  evidenceRegistry: EvidenceRegistryCore,
  contractOrRequiredCount: AgendaContract | number,
  requiredCountOverride?: number,
  options: SourceUsageValidationOptions = {},
  allowDeterministicExtractionFallback = false,
): SourceUsageValidationReport {
  const requiredCount = typeof contractOrRequiredCount === "number" ? contractOrRequiredCount : requiredCountOverride ?? contractOrRequiredCount.minimumEvidenceCardsPerModel;
  const broadBucketRequirement =
    typeof contractOrRequiredCount === "number"
      ? 0
      : requiredCount >= 20
        ? Math.min(9, requiredCount, contractOrRequiredCount.requiredSourceBuckets.length)
        : 0;
  const available = evidenceRegistry.getCitationEligibleCount();
  const effectiveRequired = Math.min(requiredCount, available);
  const roleName = modelOutput.roleName;
  const structuredFailures: StructuredSourceUsageFailure[] = [];
  const validUsedIds: number[] = [];
  const approvedUsageItems: SourceUsageMapItem[] = [];
  const rejectedSourceIds = new Set<number>();
  const bucketIds = new Set<string>();
  const rawUsedSourceIds = [...new Set(modelOutput.usedSourceIds.map((sourceId) => Number(sourceId)).filter((sourceId) => Number.isFinite(sourceId)))];
  const allowedSourceIds = normalizeAllowedSourceIds(options.allowedSourceIds ?? modelOutput.receivedSourceIds);
  const stats = {
    strongSourceCount: 0,
    mediumSourceCount: 0,
    weakSourceCount: 0,
    snippetSourceCount: 0,
    invalidSourceCount: 0,
  };
  const statSeen = new Set<number>();

  if (effectiveRequired === 0 && modelOutput.sourceUsageMap.length === 0) {
    return emptyPassedReport(rawUsedSourceIds);
  }

  for (const item of modelOutput.sourceUsageMap) {
    const source = evidenceRegistry.getSource(item.sourceId);
    const itemFailures: StructuredSourceUsageFailure[] = [];
    if (!source) {
      itemFailures.push(sourceUsageFailure("fake_source_id", roleName, `Source ${item.sourceId} does not exist in EvidenceRegistry.`, item));
      rejectedSourceIds.add(item.sourceId);
      structuredFailures.push(...itemFailures);
      stats.invalidSourceCount += 1;
      continue;
    }

    const scopeFailure = validateRoleSourceScope(roleName, item, allowedSourceIds);
    if (scopeFailure) {
      itemFailures.push(scopeFailure);
      rejectedSourceIds.add(item.sourceId);
      structuredFailures.push(...itemFailures);
      stats.invalidSourceCount += 1;
      continue;
    }

    countSourceStats(source, stats, statSeen);
    itemFailures.push(...validateItemShape(roleName, item));
    itemFailures.push(...sourceEligibilityFailures(roleName, item, source));

    const weakWarning = weakSourceWarning(roleName, item, source);
    if (weakWarning) structuredFailures.push(weakWarning);

    const shouldGround = COUNTING_USAGE_TYPES.has(item.usageType) && item.usageType !== "used_for_reliability_matrix" && item.usageType !== "used_for_citation_audit";
    let groundedItem: SourceUsageMapItem = { ...item };
    if (shouldGround && itemFailures.length === 0) {
      const grounding = groundUsageItem(item, source);
      groundedItem = {
        ...groundedItem,
        groundingStatus: grounding.grounded ? "grounded" : "ungrounded",
        evidenceSpan: grounding.evidenceSpan,
        citationStrength: source.citationStrength,
        limitedSource: source.limitedSource,
      };
      if (!grounding.grounded) {
        itemFailures.push(sourceUsageFailure("ungrounded_claim", roleName, grounding.reason ?? "Claim does not match source text.", item));
      }
    }

    if (itemFailures.length > 0) {
      rejectedSourceIds.add(item.sourceId);
      structuredFailures.push(...itemFailures);
      stats.invalidSourceCount += 1;
      continue;
    }

    if (canCountForStrictSourceUsage(source, item)) {
      validUsedIds.push(item.sourceId);
      approvedUsageItems.push(groundedItem);
      for (const bucketId of source.bucketIds) bucketIds.add(bucketId);
    } else if (item.usageType === "relevant_but_weak" || options.allowWeakContext === true) {
      approvedUsageItems.push({ ...groundedItem, groundingStatus: "weak_context", citationStrength: source.citationStrength, limitedSource: source.limitedSource });
    }
  }

  const repeatedFailure = repeatedGenericClaimFailure(modelOutput, allowDeterministicExtractionFallback);
  if (repeatedFailure) structuredFailures.push(repeatedFailure);

  const uniqueUsedSourceIds = orderedUnique(validUsedIds);
  for (const sourceId of uniqueUsedSourceIds) {
    if (!rawUsedSourceIds.includes(sourceId)) {
      structuredFailures.push(sourceUsageFailure("used_ids_mismatch", roleName, "sourceUsageMap contains used ids missing from usedSourceIds"));
    }
  }
  for (const sourceId of rawUsedSourceIds) {
    if (!uniqueUsedSourceIds.includes(sourceId)) rejectedSourceIds.add(sourceId);
  }
  if (rejectedSourceIds.size > 0) {
    structuredFailures.push(sourceUsageFailure("used_ids_mismatch", roleName, `Rejected raw usedSourceIds: ${[...rejectedSourceIds].join(", ")}`, undefined, "warning"));
  }
  if (uniqueUsedSourceIds.length < effectiveRequired) {
    structuredFailures.push(sourceUsageFailure("insufficient_valid_sources", roleName, `used fewer than ${effectiveRequired} sources with actual extraction/support`));
  }
  if (available >= requiredCount && broadBucketRequirement >= 9 && bucketIds.size < broadBucketRequirement) {
    structuredFailures.push(sourceUsageFailure("insufficient_bucket_coverage", roleName, `sources are not distributed across at least ${broadBucketRequirement} required buckets`));
  }
  if (modelOutput.sourceUsageMap.length > 0 && modelOutput.sourceUsageMap.every((item) => item.usageType === "relevant_but_weak")) {
    structuredFailures.push(sourceUsageFailure("all_sources_weak", roleName, "All SourceUsageMap items were relevant_but_weak."));
  }
  if (available < requiredCount) {
    structuredFailures.push(sourceUsageFailure("insufficient_valid_sources", roleName, `SourceGapReport may allow fewer sources: ${available} available, ${requiredCount} required.`, undefined, "warning"));
  }

  const messages = splitFailureMessages(structuredFailures);
  const errorFailures = structuredFailures.filter((failure) => failure.severity === "error");
  return {
    passed: errorFailures.length === 0 && uniqueUsedSourceIds.length >= effectiveRequired,
    usedSourceIds: uniqueUsedSourceIds,
    uniqueUsedSourceCount: uniqueUsedSourceIds.length,
    bucketCount: bucketIds.size,
    failures: messages.failures,
    warnings: messages.warnings,
    structuredFailures,
    rawUsedSourceIds,
    rejectedSourceIds: [...rejectedSourceIds].sort((a, b) => a - b),
    approvedSourceIds: uniqueUsedSourceIds,
    approvedUsageItems: approvedUsageItems.filter((item) => uniqueUsedSourceIds.includes(item.sourceId)),
    invalidSourceCount: stats.invalidSourceCount,
    strongSourceCount: stats.strongSourceCount,
    mediumSourceCount: stats.mediumSourceCount,
    weakSourceCount: stats.weakSourceCount,
    snippetSourceCount: stats.snippetSourceCount,
  };
}

function emptyPassedReport(rawUsedSourceIds: number[]): SourceUsageValidationReport {
  return {
    passed: true,
    usedSourceIds: [],
    uniqueUsedSourceCount: 0,
    bucketCount: 0,
    failures: [],
    warnings: [],
    structuredFailures: [],
    rawUsedSourceIds,
    rejectedSourceIds: [],
    approvedSourceIds: [],
    approvedUsageItems: [],
    invalidSourceCount: 0,
    strongSourceCount: 0,
    mediumSourceCount: 0,
    weakSourceCount: 0,
    snippetSourceCount: 0,
  };
}

function validateItemShape(roleName: string, item: SourceUsageMapItem): StructuredSourceUsageFailure[] {
  const failures: StructuredSourceUsageFailure[] = [];
  if (!VALID_USAGE_TYPES.includes(item.usageType)) failures.push(sourceUsageFailure("invalid_usage_type", roleName, `Invalid usageType ${item.usageType}.`, item));
  const fields = [item.extractedClaim, item.extractedNumber, item.legalHolding, item.limitation, item.supportedSection].map((value) => value?.trim() ?? "");
  if (fields.some((value) => /^title-only relevance:/i.test(value))) failures.push(sourceUsageFailure("title_only_source", roleName, `Title-only text was used for source ${item.sourceId}.`, item));
  if (fields.some((value) => value && isBoilerplateText(value))) failures.push(sourceUsageFailure("boilerplate_claim", roleName, `Boilerplate text was used for source ${item.sourceId}.`, item));
  if (!hasClaimContent(item)) failures.push(sourceUsageFailure("listing_only", roleName, `No extracted/supporting field was provided for source ${item.sourceId}.`, item));
  if (item.usageType === "fact_extracted" && !item.extractedClaim?.trim()) {
    failures.push(sourceUsageFailure("missing_required_field", roleName, `fact_extracted requires extractedClaim for source ${item.sourceId}`, item));
  }
  if (item.usageType === "number_extracted" && (!item.extractedNumber?.trim() || (!item.extractedClaim?.trim() && !item.supportedSection?.trim()))) {
    failures.push(sourceUsageFailure("missing_required_field", roleName, `number_extracted requires extractedNumber plus extractedClaim or supportedSection for source ${item.sourceId}`, item));
  }
  if (item.usageType === "legal_holding_extracted" && !item.legalHolding?.trim()) {
    failures.push(sourceUsageFailure("missing_required_field", roleName, `legal_holding_extracted requires legalHolding for source ${item.sourceId}`, item));
  }
  if (item.usageType === "limitation_identified" && !item.limitation?.trim()) {
    failures.push(sourceUsageFailure("missing_required_field", roleName, `limitation_identified requires limitation for source ${item.sourceId}`, item));
  }
  if ((item.usageType === "supports_claim" || item.usageType === "challenges_claim") && (!item.extractedClaim?.trim() && !item.supportedSection?.trim())) {
    failures.push(sourceUsageFailure("missing_required_field", roleName, `${item.usageType} requires extractedClaim or supportedSection for source ${item.sourceId}`, item));
  }
  if (item.usageType === "used_for_debate_utility" && (!item.extractedClaim?.trim() || !item.supportedSection?.trim())) {
    failures.push(sourceUsageFailure("missing_required_field", roleName, `used_for_debate_utility requires extractedClaim and supportedSection for source ${item.sourceId}`, item));
  }
  if ((item.usageType === "used_for_reliability_matrix" || item.usageType === "used_for_citation_audit" || item.usageType === "relevant_but_weak") && !item.limitation?.trim()) {
    failures.push(sourceUsageFailure("missing_required_field", roleName, `${item.usageType} requires limitation/reason for source ${item.sourceId}`, item));
  }
  return failures;
}

function repeatedGenericClaimFailure(modelOutput: ModelRoleOutput, allowDeterministicExtractionFallback: boolean): StructuredSourceUsageFailure | null {
  const extractedClaims = modelOutput.sourceUsageMap
    .map((item) => item.extractedClaim?.trim().toLowerCase())
    .filter((claim): claim is string => Boolean(claim));
  const claimCounts = new Map<string, number>();
  for (const claim of extractedClaims) claimCounts.set(claim, (claimCounts.get(claim) ?? 0) + 1);
  for (const [claim, count] of claimCounts) {
    const absoluteThreshold = allowDeterministicExtractionFallback ? Infinity : 5;
    if (count >= absoluteThreshold || (modelOutput.sourceUsageMap.length >= 30 && count >= Math.ceil(modelOutput.sourceUsageMap.length * 0.25))) {
      return sourceUsageFailure("repeated_generic_claim", modelOutput.roleName, `same generic claim repeated for many unrelated sources: ${claim.slice(0, 80)}`);
    }
  }
  return null;
}

function countSourceStats(source: EvidenceSource, stats: { strongSourceCount: number; mediumSourceCount: number; weakSourceCount: number; snippetSourceCount: number }, seen: Set<number>): void {
  if (seen.has(source.id)) return;
  seen.add(source.id);
  if (source.citationStrength === "strong") stats.strongSourceCount += 1;
  else if (source.citationStrength === "medium") stats.mediumSourceCount += 1;
  else if (source.citationStrength === "weak") stats.weakSourceCount += 1;
  if (source.extractionQuality === "snippet" || source.limitedSource) stats.snippetSourceCount += 1;
}

function orderedUnique(ids: number[]): number[] {
  const seen = new Set<number>();
  return ids.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
