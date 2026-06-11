import type { ResearchMode } from "../../config/research-mode.js";
import type { EvidenceCard } from "../../evidence/evidence-pack-builder.js";
import type { SourceUsageValidationReport } from "../../evidence/source-usage-map.js";
import { buildRoleSpecificInstructions } from "./role-specific-instructions.js";
import type { RoleRetryPromptInput } from "./types.js";

export function buildRoleRetryPrompt(input: RoleRetryPromptInput): string {
  return [
    "ROLE-SPECIFIC RETRY REQUIRED.",
    `Failed source IDs: ${input.failedSourceIds.join(", ") || "none"}.`,
    `Structured failure reasons: ${input.failures.join(" | ") || "unknown validation failure"}.`,
    input.previousPromptFingerprint ? `Do not repeat the previous prompt fingerprint: ${input.previousPromptFingerprint}.` : "",
    buildRoleSpecificInstructions(input.roleName, input.researchMode, { stricter: true }),
    `Valid ${input.roleName} extraction example: {"sourceUsageMap":[{"sourceId":${input.failedSourceIds[0] ?? 1},"usageType":"fact_extracted","extractedClaim":"A source-specific claim copied or paraphrased from assigned text.","supportedSection":"evidence_verification","confidence":"medium"}]}`,
    "Retry only the failed assigned source IDs when possible. Out-of-batch IDs are invalid.",
  ].filter(Boolean).join("\n");
}

export function failedSourceIdsForRetry(
  validation: SourceUsageValidationReport,
  batch: EvidenceCard[],
): number[] {
  const approved = new Set(validation.usedSourceIds);
  const explicitRejected = new Set(validation.rejectedSourceIds);
  return batch
    .map((card) => card.sourceId)
    .filter((sourceId) => explicitRejected.has(sourceId) || !approved.has(sourceId));
}

export function researchModeForRetry(mode: ResearchMode | undefined): ResearchMode {
  return mode ?? "deep_research";
}
