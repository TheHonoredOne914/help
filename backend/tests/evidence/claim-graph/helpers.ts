import { buildAgendaContract } from "../../../src/core/agenda/agenda-contract.js";
import { buildClaimGraph } from "../../../src/core/evidence/claim-graph.js";
import { buildEvidencePacks } from "../../../src/core/evidence/evidence-pack-builder.js";
import { buildEvidenceRegistryFromSources, type EvidenceRegistryCore, type RawEvidenceSourceInput, type SourceClass } from "../../../src/core/evidence/evidence-registry.js";
import type { ModelRoleOutput, SourceUsageMapItem } from "../../../src/core/evidence/source-usage-map.js";

export function createClaimGraphFixture() {
  const agendaContract = buildAgendaContract({ requestId: "claim-graph-test", originalUserQuery: "AIPPM debate on India election integrity, Supreme Court doctrine, civil liberties, and Union ministry accountability" });
  const sources: RawEvidenceSourceInput[] = [
    source(1, "Election Commission official EVM note", "official_government", "The Election Commission states EVM transparency safeguards are secure and audit trails reduce manipulation risk.", ["ECI says EVM transparency safeguards are secure"], ["EVM transparency complaints decreased 12% in 2025"]),
    source(2, "Civil liberties watchdog election report", "human_rights_watchdog", "The watchdog alleges EVM transparency concerns increased 27% in India and requires careful language.", ["Watchdog alleges EVM transparency concerns increased"], []),
    source(3, "Supreme Court VVPAT judgment", "court_primary", "The Supreme Court held in ADR v Election Commission that VVPAT verification must balance transparency and administrative feasibility.", [], [], ["ADR v Election Commission held proportionality applies to VVPAT verification."]),
    source(4, "Policy research democracy index", "policy_research", "India scored 66.2 on the civic space index and ranked 41st in a comparative democracy table.", ["India ranked 41st in comparative democracy table"], ["score 66.2", "ranked 41st"]),
    source(5, "Snippet legal commentary", "legal_commentary", "A blog says a judgment may affect election petitions.", [], [], [], "snippet"),
  ];
  const evidenceRegistry = buildEvidenceRegistryFromSources(sources, agendaContract);
  const evidencePacks = Object.values(buildEvidencePacks(evidenceRegistry, agendaContract));
  return { agendaContract, evidenceRegistry, evidencePacks };
}

export function buildValidatedGraph() {
  const fixture = createClaimGraphFixture();
  const modelRoleOutputs = [
    roleOutput("evidence_extractor", [
      usage(1, "supports_claim", "ECI says EVM transparency safeguards are secure"),
      usage(2, "challenges_claim", "Watchdog alleges EVM transparency concerns increased"),
      usage(3, "legal_holding_extracted", undefined, "ADR v Election Commission held proportionality applies to VVPAT verification."),
      usage(4, "number_extracted", "India scored 66.2 and ranked 41st in comparative democracy table"),
    ]),
  ];
  const sourceUsageAggregate = {
    validUsedSourceIds: [1, 2, 3, 4],
    perRoleValidation: [{ roleName: "evidence_extractor", passed: true, usedSourceIds: [1, 2, 3, 4], rejectedSourceIds: [5], failures: [], warnings: [], structuredFailures: [], strongSourceCount: 4, mediumSourceCount: 0, weakSourceCount: 0, snippetSourceCount: 0 }],
  };
  const claimGraph = buildClaimGraph(fixture.evidenceRegistry, fixture.agendaContract, {
    evidencePacks: fixture.evidencePacks,
    modelRoleOutputs,
    sourceUsageAggregate,
    mode: "deep_research",
  });
  return { ...fixture, modelRoleOutputs, sourceUsageAggregate, claimGraph };
}

export function roleOutput(roleName: string, sourceUsageMap: SourceUsageMapItem[]): ModelRoleOutput {
  return {
    roleName,
    requiredSourceCount: sourceUsageMap.length,
    receivedSourceIds: sourceUsageMap.map((item) => item.sourceId),
    usedSourceIds: sourceUsageMap.map((item) => item.sourceId),
    unusedSourceIds: [],
    sourceUsageMap,
    sourceUsageCount: sourceUsageMap.length,
    sourceUsageRequirementSatisfied: true,
    output: {},
  };
}

export function usage(sourceId: number, usageType: SourceUsageMapItem["usageType"], extractedClaim?: string, legalHolding?: string): SourceUsageMapItem {
  return {
    sourceId,
    title: `Source ${sourceId}`,
    bucketIds: ["electoral_integrity"],
    sourceClass: sourceId === 3 ? "court_primary" : sourceId === 2 ? "human_rights_watchdog" : sourceId === 1 ? "official_government" : "policy_research",
    usageType,
    extractedClaim,
    legalHolding,
    extractedNumber: usageType === "number_extracted" ? extractedClaim : undefined,
    confidence: "high",
    evidenceSpan: { sourceId, text: extractedClaim ?? legalHolding ?? "", extractionQuality: "full", sharedTokens: ["india", "election"], verifiedBy: usageType === "legal_holding_extracted" ? "legal_holding" : "key_fact" },
    citationStrength: "strong",
  };
}

function source(id: number, title: string, sourceClass: SourceClass, fullText: string, keyFacts: string[], keyNumbers: string[], legalHoldings: string[] = [], extractionQuality: "full" | "snippet" = "full"): RawEvidenceSourceInput {
  return {
    id,
    title,
    url: `https://example.org/source-${id}`,
    canonicalUrl: `https://example.org/source-${id}`,
    domain: "example.org",
    bucketIds: ["electoral_integrity"],
    sourceClass,
    authorityScore: 90,
    date: "2026-05-01",
    fullText,
    snippet: fullText,
    extractionQuality,
    keyFacts,
    keyNumbers,
    legalHoldings,
    namedEntities: ["India", "Election Commission of India"],
    limitations: extractionQuality === "snippet" ? ["Snippet-only extraction."] : [],
    confidence: "high",
    citationEligible: true,
    topChunks: [{ text: fullText, score: 0.9, chunkIndex: 0, sourceId: id }],
  };
}

export function assertSourceApprovedStrong(registry: EvidenceRegistryCore, sourceId: number): void {
  const source = registry.getSource(sourceId);
  if (!source?.citationEligible) throw new Error(`Expected source ${sourceId} to be citation eligible`);
}
