import { buildAgendaContract } from "../../../src/core/agenda/agenda-contract.js";
import { buildClaimLedger, type ClaimLedger } from "../../../src/core/evidence/claim-ledger.js";
import type { ClaimGraph } from "../../../src/core/evidence/claim-graph.js";
import { buildEvidenceRegistryFromSources, type EvidenceRegistryCore, type RawEvidenceSourceInput, type SourceClass } from "../../../src/core/evidence/evidence-registry.js";
import type { ModelRoleOutput, SourceUsageMapItem, SourceUsageValidationReport } from "../../../src/core/evidence/source-usage-map.js";
import type { ResearchMode } from "../../../src/core/config/research-mode.js";
import type { QualityGateInput } from "../../../src/core/verification/thesis-quality-gate.js";

const SOURCE_CLASSES: SourceClass[] = [
  "official_government",
  "parliamentary_records",
  "court_primary",
  "legal_commentary",
  "policy_research",
  "indian_major_media",
  "academic_journal",
  "human_rights_watchdog",
  "democracy_index",
  "electoral_body",
];

const BUCKETS = [
  "government_official",
  "parliamentary_records",
  "court_legal",
  "legal_commentary",
  "policy_research",
  "indian_major_media",
  "academic_research",
  "human_rights_watchdog",
  "democracy_index",
  "electoral_integrity",
];

export function createQualityGateHarnessFixture(options: {
  mode?: ResearchMode;
  sourceCount?: number;
  snippetOnly?: boolean;
  concentratedBucket?: boolean;
} = {}) {
  const mode = options.mode ?? "deep_research";
  const sourceCount = options.sourceCount ?? 30;
  const contract = buildAgendaContract({
    requestId: `brick21-${mode}`,
    originalUserQuery: "AIPPM debate on Indian election integrity, Article 19, Supreme Court doctrine, Union ministry accountability, and parliamentary remedies",
    outputDepth: mode,
  });
  contract.minimumUniqueCitedSources = mode === "fast_research" ? 5 : mode === "deep_research" ? 10 : 30;
  contract.minimumEvidenceCardsPerModel = mode === "fast_research" ? 3 : mode === "deep_research" ? 8 : 20;

  const registry = buildEvidenceRegistryFromSources(
    Array.from({ length: sourceCount }, (_, index) => buildSource(index + 1, options)),
    contract,
  );
  const role = roleOutput("thesis_synthesizer", sourceCount);
  const sourceUsageValidationReport: SourceUsageValidationReport = {
    passed: true,
    usedSourceIds: Array.from({ length: sourceCount }, (_, index) => index + 1),
    rejectedSourceIds: [],
    failures: [],
    warnings: [],
    structuredFailures: [],
    strongSourceCount: options.snippetOnly ? 0 : sourceCount,
    mediumSourceCount: 0,
    weakSourceCount: options.snippetOnly ? sourceCount : 0,
    snippetSourceCount: options.snippetOnly ? sourceCount : 0,
  };
  const claimGraph = buildClaimGraphFixture(sourceCount);
  const claimLedger = buildClaimLedger([role], registry, sourceUsageValidationReport.usedSourceIds);
  const input: QualityGateInput = {
    uniqueCitedSourceIds: sourceUsageValidationReport.usedSourceIds,
    citedBucketIds: [...new Set(registry.sources.flatMap((source) => source.bucketIds))],
    modelRoleOutputs: [role],
    mode,
    claimGraph,
    claimLedger,
    evidenceRegistry: registry,
    sourceUsageValidationReport,
    divisionOutputs: buildDivisionOutputs(registry),
  } as QualityGateInput;

  return { contract, registry, input, claimGraph, claimLedger, sourceUsageValidationReport, role };
}

export function buildPassingAnswer(registry: EvidenceRegistryCore, mode: ResearchMode = "deep_research"): string {
  const citations = registry.sources.slice(0, mode === "fast_research" ? 8 : 30).map((source) => registry.getCitationMarkdown(source.id)).join(" ");
  return [
    "# Executive Thesis",
    `India's election-integrity debate requires careful parliamentary scrutiny of Election Commission safeguards, Article 19 speech limits, and Supreme Court proportionality doctrine. Treasury Bench can defend administrable safeguards while Opposition can press transparency and rights-based limits. ${citations}`,
    "# Methodology and Source Base",
    "The answer uses registry-backed official, parliamentary, legal, policy, media, academic, watchdog, democracy-index, and electoral sources. Weak or missing buckets are disclosed rather than converted into proof.",
    "# Research Angle Map",
    "D1 agenda lock, D2 analytical dimensions, D3 stakeholders, D4 contradictions, D5 narrative frames, D6 evidence verification, D7 debate utility, D8 policy, D9 predictions, D10 tradeoffs, and D11 strategy are integrated.",
    "# Indian Mock Parliament Debate Utility Arsenal",
    buildD7Section(mode),
    "# Final Strategic Synthesis",
    buildD11Section(mode),
  ].join("\n\n");
}

export function buildD7Section(mode: ResearchMode = "deep_research"): string {
  const poiMinimum = mode === "fast_research" ? 5 : mode === "deep_research" ? 8 : mode === "deep_research" ? 12 : 15;
  const pois = Array.from({ length: poiMinimum }, (_, index) => `POI ${index + 1}: Can the honourable member identify the registry source that proves safeguard ${index + 1}?`).join("\n");
  return [
    "Treasury Bench:",
    "1. Defend Election Commission process with official and court-backed safeguards.",
    "2. Link public order and administrability to proportionate legal limits.",
    "3. Offer ministry accountability and committee reporting.",
    "Opposition:",
    "1. Challenge overbreadth through Article 19 and Article 21 proportionality.",
    "2. Demand transparent audit trails without asserting fraud as proven.",
    "3. Convert weak evidence into disclosure motions and amendments.",
    "POI Bank:",
    pois,
    "Rebuttals: distinguish allegation from proven fraud, court holding from political inference, and official assurance from independent audit.",
    "Amendment: add an operative clause requiring disclosure, independent audit, and committee follow-up.",
  ].join("\n");
}

export function buildD11Section(mode: ResearchMode = "deep_research"): string {
  const extra = mode === "council"
    ? " It also weighs counterclaims and contradictions across all prior divisions before ranking floor strategy."
    : "";
  return [
    `Diagnosis: D1-D10 show a central contradiction between electoral confidence, rights-based challenge, federalism concerns, and administrable Election Commission defence.${extra}`,
    "Prescription: Treasury Bench should lead with source-backed legality and accountability; Opposition should use POIs, disclosure motions, and narrowing amendments where evidence is weak.",
    "Warning: Do not assert fraud, legal holdings, or statistical decline beyond ClaimGraph and ClaimLedger support.",
  ].join("\n");
}

export function buildQuestionMarkD7(): string {
  return [
    "Treasury Bench:",
    "1. Defend safeguards.",
    "2. Cite accountability.",
    "3. Offer oversight.",
    "Opposition:",
    "1. Ask questions?",
    "2. Raise concerns?",
    "3. Challenge process?",
    "Rebuttals? Motions? Amendments?",
  ].join("\n");
}

function buildSource(id: number, options: { snippetOnly?: boolean; concentratedBucket?: boolean }): RawEvidenceSourceInput {
  const index = id - 1;
  const sourceClass = SOURCE_CLASSES[index % SOURCE_CLASSES.length];
  const bucket = options.concentratedBucket ? "democracy_index" : BUCKETS[index % BUCKETS.length];
  const quality = options.snippetOnly ? "snippet" : "full";
  const claim = `Evidence item ${id} supports Indian election integrity safeguard ${id} with Article 19 proportionality and parliamentary accountability.`;
  return {
    id,
    title: `Brick 21 Source ${id}`,
    url: `https://example.org/brick21/source-${id}`,
    canonicalUrl: `https://example.org/brick21/source-${id}`,
    domain: "example.org",
    bucketIds: [bucket as any],
    sourceClass,
    authorityScore: 90,
    date: "2026-05-01",
    fullText: options.snippetOnly ? null : claim,
    snippet: claim,
    extractionQuality: quality,
    keyFacts: [claim],
    keyNumbers: [`safeguard ${id}`],
    legalHoldings: sourceClass === "court_primary" ? [`Article 19 proportionality applies to election-integrity restrictions in source ${id}.`] : [],
    namedEntities: ["India", "Election Commission of India", "Supreme Court"],
    limitations: options.snippetOnly ? ["Snippet-only source."] : [],
    confidence: "high",
    citationEligible: true,
    topChunks: [{ sourceId: id, text: claim, score: 0.9, chunkIndex: 0 }],
  };
}

function roleOutput(roleName: string, count: number): ModelRoleOutput {
  const sourceUsageMap = Array.from({ length: count }, (_, index) => usage(index + 1));
  return {
    roleName,
    requiredSourceCount: count,
    receivedSourceIds: sourceUsageMap.map((item) => item.sourceId),
    usedSourceIds: sourceUsageMap.map((item) => item.sourceId),
    unusedSourceIds: [],
    sourceUsageMap,
    sourceUsageCount: count,
    sourceUsageRequirementSatisfied: true,
    minimumSourceRequirement: Math.min(30, count),
    sourceCountUsed: count,
    sourceRequirementSatisfied: true,
    output: "",
  };
}

function usage(sourceId: number): SourceUsageMapItem {
  return {
    sourceId,
    title: `Brick 21 Source ${sourceId}`,
    bucketIds: [BUCKETS[(sourceId - 1) % BUCKETS.length] as any],
    sourceClass: SOURCE_CLASSES[(sourceId - 1) % SOURCE_CLASSES.length],
    usageType: sourceId % 5 === 0 ? "legal_holding_extracted" : sourceId % 3 === 0 ? "number_extracted" : "supports_claim",
    extractedClaim: `Evidence item ${sourceId} supports Indian election integrity safeguard ${sourceId}`,
    extractedNumber: sourceId % 3 === 0 ? `safeguard ${sourceId}` : undefined,
    legalHolding: sourceId % 5 === 0 ? `Article 19 proportionality applies to election-integrity restrictions in source ${sourceId}.` : undefined,
    supportedSection: `D${(sourceId % 11) + 1}`,
    confidence: "high",
    evidenceSpan: { sourceId, text: `Evidence item ${sourceId} supports Indian election integrity safeguard ${sourceId}`, extractionQuality: "full", sharedTokens: ["election", "integrity"], verifiedBy: "key_fact" },
    citationStrength: "strong",
  };
}

function buildClaimGraphFixture(count: number): ClaimGraph {
  const claims = Array.from({ length: count }, (_, index) => {
    const sourceId = index + 1;
    return {
      id: `claim-${sourceId}`,
      text: `Evidence item ${sourceId} supports Indian election integrity safeguard ${sourceId}`,
      type: sourceId % 5 === 0 ? "legal_holding" as const : "fact" as const,
      requiredSourceClasses: [SOURCE_CLASSES[index % SOURCE_CLASSES.length]],
      supportingSourceIds: [sourceId],
      confidence: "high" as const,
      mustUseCarefulLanguage: false,
      forbiddenIfUnsupported: false,
      sourceTrace: [{
        sourceId,
        sourceClass: SOURCE_CLASSES[index % SOURCE_CLASSES.length],
        citationStrength: "strong" as const,
        extractionQuality: "full" as const,
        validationStatus: "approved" as const,
        evidenceSpan: `Evidence item ${sourceId} supports Indian election integrity safeguard ${sourceId}`,
      }],
    };
  });
  return {
    claims,
    counterclaims: [{ id: "counter-1", text: "Opposition disputes official safeguards where audit evidence is thin.", sourceIds: [2, 4], sourceClasses: ["human_rights_watchdog", "policy_research"], supportScore: 0.8, requiresCarefulLanguage: true }],
    contradictions: [{ id: "contradiction-1", claimIds: ["claim-1", "claim-2"], type: "official_watchdog_conflict", description: "Official safeguard claims conflict with watchdog transparency concerns.", severity: "medium", sourceIds: [1, 2] }],
    unsupportedClaims: [],
    summary: { claimCount: claims.length, counterclaimCount: 1, contradictionCount: 1, strongClaimCount: claims.length, carefulLanguageClaimCount: 1, approvedSourceCount: count },
  };
}

function buildDivisionOutputs(registry: EvidenceRegistryCore): Map<string, string> {
  const citation = registry.getCitationMarkdown(1);
  return new Map([
    ["D1", `Agenda lock: India election-integrity thesis defines the parliamentary motion, agenda scope, and clear thesis for AIPPM floor debate with India relevance. ${citation}`],
    ["D2", `Analytical dimensions: legal dimension, institutional dimension, political dimension, federal dimension, rights dimension, and administrative dimension are separated rather than merged generically. ${citation}`],
    ["D3", `Stakeholder mapping: Treasury Bench, Opposition, Election Commission, Union ministry, Supreme Court, voters, civil society, and state governments have distinct role clarity. ${citation}`],
    ["D4", `Conflict mapping: official assurance creates a contradiction with watchdog concerns, court proportionality demands, and Opposition transparency pressure. ${citation}`],
    ["D5", `Narrative analysis: public-order framing, rights-based challenge framing, institutional trust framing, and political accountability framing compete in parliamentary debate. ${citation}`],
    ["D6", `Evidence verification: registry source classes, citation strength, top chunks, SourceUsageMap approval, ClaimLedger support, and limitations are separated. ${citation}`],
    ["D7", buildD7Section()],
    ["D8", `Policy pathways: disclosure pathway, audit pathway, committee reporting pathway, feasibility constraints, and staged implementation pathway are ranked. ${citation}`],
    ["D9", `Predictive analysis: if transparency improves trust may rise; if secrecy persists litigation pressure increases; conditional predict statements remain source qualified. ${citation}`],
    ["D10", `Risks and tradeoffs: overclaim risk, fraud overclaim risk, administrative tradeoff, rights dilution tradeoff, and public trust tradeoff are explicit. ${citation}`],
    ["D11", buildD11Section()],
  ]);
}
