import type { EvidenceRegistryCore } from "../evidence-registry.js";
import { detectUnsupportedClaims } from "./unsupported-claim-detector.js";
import type { ClaimGraph } from "./types.js";

export interface LegacyClaimGraphContext {
  claimGraphApplied: boolean;
  degraded: boolean;
  unsupportedIssueCount: number;
  degradationReason?: string;
}

export function buildLegacyClaimGraphContext(finalAnswer: string, graph: ClaimGraph | null | undefined, registry: EvidenceRegistryCore): LegacyClaimGraphContext {
  if (!graph) {
    return { claimGraphApplied: false, degraded: true, unsupportedIssueCount: 0, degradationReason: "ClaimGraph unavailable for legacy output." };
  }
  const issues = detectUnsupportedClaims(finalAnswer, graph, registry);
  return {
    claimGraphApplied: true,
    degraded: issues.length > 0,
    unsupportedIssueCount: issues.length,
    degradationReason: issues.length ? `Legacy output has ${issues.length} ClaimGraph guard issue(s).` : undefined,
  };
}
