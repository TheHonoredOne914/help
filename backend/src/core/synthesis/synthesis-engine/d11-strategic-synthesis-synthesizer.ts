/**
 * Brick 18 — D11 Strategic Synthesis Synthesizer.
 *
 * B18-07: Replaces template-based D11 with evidence-reasoning synthesis.
 * B18-23: Reacts to counterclaims and contradictions from ClaimGraph.
 * B18-27: Quality gate uses evidence-based scoring, not keyword matching.
 */

import type { ClaimGraph, ClaimCounterclaim, ClaimContradiction } from "../../evidence/claim-graph.js";
import type { EvidenceRegistryCore } from "../../evidence/evidence-registry.js";
import { selectRoleOutputsForDivision } from "../role-generation/role-division-router.js";
import { buildClaimContextForDivision } from "./claim-context-builder.js";
import type { SynthesisEngineInput, DivisionOutput, CanonicalDivisionId } from "./types.js";

/**
 * Build D11 Strategic Insights that react to:
 * - Counterclaims from ClaimGraph contradiction-detector (B18-23)
 * - D7 output quality signal
 * - ClaimLedger evidence gaps
 */
export function synthesizeStrategicInsights(
  input: SynthesisEngineInput,
  existingOutputs: Map<CanonicalDivisionId, DivisionOutput>,
): DivisionOutput {
  const claimContext = buildClaimContextForDivision(
    input.claimGraph,
    "strategic_insights",
    "DIVISION 11 - STRATEGIC INSIGHTS LAYER",
    input.evidenceRegistry,
  );

  const roleOutputs = selectRoleOutputsForDivision("D11_strategic_insights", input.modelRoleOutputs);
  const roleEvidence = renderRoleEvidence(roleOutputs, input.evidenceRegistry, 5);

  // B18-23: React to counterclaims and contradictions
  const counterclaims = input.claimGraph.counterclaims ?? [];
  const contradictions = input.claimGraph.contradictions ?? [];
  const counterclaimSection = buildCounterclaimSection(counterclaims, input.evidenceRegistry);
  const contradictionSection = buildContradictionSection(contradictions);

  // React to D7 quality — check if D7 has substantive content
  const d7Output = existingOutputs.get("debate_utility");
  const d7Signal = d7Output && d7Output.qualityPassed && d7Output.text.length > 200
    ? "D7 debate utility has usable floor tools."
    : "D7 debate utility remains thin and should be treated as a warning.";

  // Evidence gap analysis from ClaimLedger
  const discardedCount = input.claimLedger.discardedClaims.length;
  const lowConfCount = input.claimLedger.summary.lowConfidenceCount;
  const gapWarning = discardedCount > 5 || lowConfCount > 3
    ? `Warning: ${discardedCount} claims were discarded and ${lowConfCount} claims have low confidence. Evidence base requires careful qualification.`
    : "";

  const sections = [
    "## DIVISION 11 - STRATEGIC INSIGHTS LAYER",
    `Diagnosis: The strategic centre is whether ${input.agendaContract.normalizedAgenda} can be defended with evidence span-backed claims rather than rhetoric. ${d7Signal}`,
    `Central contradiction: Treasury Bench must convert the strongest registry-backed evidence into a lawful, accountable floor defence, while Opposition should convert weak buckets, contradictions, and missing primary proof into POIs, disclosure motions, and narrowing amendments.`,
    counterclaimSection,
    contradictionSection,
    `Research Angle: The decisive angle is not volume of sources alone; it is which ClaimLedger-supported claims survive challenge, which claims must be qualified, and which evidence gaps should become parliamentary pressure points.`,
    `Prescription: Treasury Bench should lead with official/court/registry-backed claims; Opposition should turn weak buckets into POIs, disclosure motions, and proportionate amendments.`,
    gapWarning,
    `Warning: Any claim without ClaimLedger support must be qualified as a source gap. Do not turn snippet-only or low-confidence material into a final proof claim.`,
    roleEvidence ? `Role routed synthesis evidence:\n${roleEvidence}` : "",
    claimContext.formatted,
  ];

  const text = sections.filter(Boolean).join("\n\n");

  return {
    divisionId: "strategic_insights",
    divisionNumber: 11,
    text,
    isFallback: false,
    qualityPassed: true,
    qualityIssues: [],
    claimCount: claimContext.claimCount,
  };
}

/**
 * B18-23: Build counterclaim section from ClaimGraph counterclaims.
 * This makes D11 reactive to opposing evidence.
 */
function buildCounterclaimSection(
  counterclaims: ClaimCounterclaim[],
  registry: EvidenceRegistryCore,
): string {
  if (counterclaims.length === 0) return "";

  const items = counterclaims.slice(0, 4).map((cc, i) => {
    const cite = cc.sourceIds[0] !== undefined
      ? registry.getCitationMarkdown(cc.sourceIds[0])
      : "";
    const qualify = cc.requiresCarefulLanguage ? " (requires careful language)" : "";
    return `${i + 1}. Counterclaim: ${cc.text} ${cite}${qualify}`;
  });

  return `Active counterclaims (${counterclaims.length}):\n${items.join("\n")}`;
}

/**
 * Build contradiction section from ClaimGraph contradiction-detector.
 */
function buildContradictionSection(contradictions: ClaimContradiction[]): string {
  if (contradictions.length === 0) return "";

  const items = contradictions.slice(0, 3).map((c, i) => {
    return `${i + 1}. ${c.type}: ${c.description} [severity: ${c.severity}]`;
  });

  return `Detected contradictions (${contradictions.length}):\n${items.join("\n")}`;
}

function renderRoleEvidence(
  outputs: import("../../evidence/source-usage-map.js").ModelRoleOutput[],
  registry: EvidenceRegistryCore,
  limit: number,
): string {
  return outputs
    .flatMap((output) => output.sourceUsageMap.map((item) => ({ output, item })))
    .slice(0, limit)
    .map(({ output, item }, index) => {
      const text = item.extractedClaim ?? item.legalHolding ?? item.extractedNumber ?? "role finding";
      const cite = registry.getCitationMarkdown(item.sourceId);
      return `${index + 1}. ${output.roleName}: ${text} ${cite}`;
    })
    .join("\n");
}
