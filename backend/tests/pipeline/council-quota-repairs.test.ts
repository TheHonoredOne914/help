import test from "node:test";
import assert from "node:assert/strict";
import { runTargetedRepair } from "../../src/core/verification/repair-orchestrator.js";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { contentWordCount } from "../../src/core/quality-gate/quality-gate-input.js";
import { validateSourceUsageMap } from "../../src/core/evidence/source-usage/validate-source-usage-map.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { getSourceUsagePolicy } from "../../src/core/config/source-usage-policy.js";

test("length_repair fills toward mode minWords using pack cards", async () => {
  const contract = buildAgendaContract({
    requestId: "length-repair-floor",
    originalUserQuery: "Council research on election advertising regulation in India",
    outputDepth: "detailed",
  });
  const packs = [{
    packId: "pack-a",
    bucketId: "policy_research",
    cards: Array.from({ length: 200 }, (_, index) => ({
      sourceId: index + 1,
      citation: `[Source ${index + 1}](https://example.org/${index + 1})`,
      title: `Source ${index + 1}`,
      url: `https://example.org/${index + 1}`,
      sourceClass: "policy_research" as const,
      bucketIds: [`bucket_${(index % 8) + 1}`],
      date: "2024-01-01",
      relevanceScore: 80,
      keyFacts: [`Concrete parliamentary evidence point ${index + 1} about advertising transparency obligations for platforms and parties during elections, including notice-and-takedown timelines, intermediary liability, and Election Commission guidance for political deepfakes.`],
      keyNumbers: [],
      legalHoldings: [],
      governmentPosition: null,
      civilLibertiesPosition: null,
      electoralIntegrityPosition: null,
      debateUse: `Use source ${index + 1} for floor strategy on platform transparency and deepfake regulation.`,
      limitations: [],
      usableSections: [`bucket_${(index % 8) + 1}`],
      contentPreview: `Concrete parliamentary evidence point ${index + 1} about advertising transparency obligations for platforms and parties during elections, including notice-and-takedown timelines, intermediary liability, and Election Commission guidance for political deepfakes.`,
      extractionQuality: "full" as const,
      citationStrength: "medium" as const,
    })),
  }];
  const short = "Treasury Bench and Opposition clash on deepfake regulation. " + Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
  const repaired = await runTargetedRepair(short, contract, packs as any, "length_repair", { minWords: 3000 });
  assert.match(repaired, /Additional Source-Backed Bullets/);
  assert.match(repaired, /\*\*Claim:\*\*/);
  assert.match(repaired, /\*\*Mechanism\/use:\*\*/);
  assert.ok(contentWordCount(repaired) >= 3000, `expected >=3000 words, got ${contentWordCount(repaired)}`);
});

test("length_repair rejects Lok Sabha chrome dumps", async () => {
  const contract = buildAgendaContract({
    requestId: "length-repair-chrome",
    originalUserQuery: "NFHS obesity AIPPM",
  });
  const packs = [{
    packId: "pack-chrome",
    bucketId: "policy_research",
    cards: [
      {
        sourceId: 1,
        citation: "[Source 1](https://example.org/1)",
        title: "Lok Sabha Q",
        url: "https://example.org/1",
        sourceClass: "policy_research" as const,
        bucketIds: ["policy_research"],
        date: "2024-01-01",
        relevanceScore: 80,
        keyFacts: [],
        keyNumbers: [],
        legalHoldings: [],
        governmentPosition: null,
        civilLibertiesPosition: null,
        electoralIntegrityPosition: null,
        debateUse: "",
        limitations: [],
        usableSections: ["policy_research"],
        contentPreview: "GOVERNMENT OF INDIA MINISTRY OF HEALTH LOK SABHA UNSTARRED QUESTION NO. 1061 Will the Minister of HEALTH be pleased to state",
        extractionQuality: "full" as const,
        citationStrength: "strong" as const,
      },
      {
        sourceId: 2,
        citation: "[Source 2](https://example.org/2)",
        title: "PIB obesity",
        url: "https://example.org/2",
        sourceClass: "policy_research" as const,
        bucketIds: ["policy_research"],
        date: "2024-01-01",
        relevanceScore: 90,
        keyFacts: ["NFHS-6 reports 30.7% of women aged 15-49 as overweight or obese, up from prior survey rounds."],
        keyNumbers: ["30.7%"],
        legalHoldings: [],
        governmentPosition: null,
        civilLibertiesPosition: null,
        electoralIntegrityPosition: null,
        debateUse: "Treasury cites Fit India; Opposition presses advertising regulation using this prevalence spike.",
        limitations: [],
        usableSections: ["policy_research"],
        contentPreview: "STATES CITIES SPORTS ENTERTAINMENT # SEO junk title about obesity",
        extractionQuality: "full" as const,
        citationStrength: "strong" as const,
      },
    ],
  }];
  const repaired = await runTargetedRepair("Short draft on obesity.", contract, packs as any, "length_repair", { minWords: 80 });
  assert.match(repaired, /30\.7%/);
  assert.match(repaired, /Mechanism\/use/);
  assert.doesNotMatch(repaired, /LOK SABHA UNSTARRED/);
  assert.doesNotMatch(repaired, /STATES CITIES SPORTS/);
});

test("council policy is non-strict union-floor with deterministic fallback", () => {
  const policy = getSourceUsagePolicy("council");
  assert.equal(policy.requiredSources, 110);
  assert.equal(policy.strictFailure, false);
  assert.equal(policy.allowDeterministicExtractionFallback, true);
});

test("bucket coverage requirement cannot exceed available eligible buckets", () => {
  const contract = buildAgendaContract({
    requestId: "bucket-cap",
    originalUserQuery: "Deep research on Indian election advertising and deepfakes",
    outputDepth: "detailed",
  });
  const sources = Array.from({ length: 40 }, (_, index) => ({
    id: index + 1,
    title: `Source ${index + 1}`,
    url: `https://example.org/s-${index + 1}`,
    canonicalUrl: `https://example.org/s-${index + 1}`,
    domain: "example.org",
    bucketIds: [`only_bucket_${(index % 3) + 1}`],
    sourceClass: "policy_research" as const,
    authorityScore: 80,
    date: "2024-01-01",
    fullText: `Detailed evidence claim ${index + 1} about Indian parliamentary regulation of political advertising and deepfakes.`,
    snippet: `Detailed evidence claim ${index + 1} about Indian parliamentary regulation of political advertising and deepfakes.`,
    extractionQuality: "full" as const,
    keyFacts: [`Detailed evidence claim ${index + 1} about Indian parliamentary regulation of political advertising and deepfakes.`],
    keyNumbers: [],
    legalHoldings: [],
    namedEntities: [],
    limitations: [],
    confidence: "medium" as const,
    citationEligible: true,
  }));
  const registry = buildEvidenceRegistryFromSources(sources, contract);
  const used = sources.map((source) => source.id);
  const report = validateSourceUsageMap({
    roleName: "evidence_extractor",
    requiredSourceCount: 30,
    receivedSourceIds: used,
    usedSourceIds: used,
    unusedSourceIds: [],
    sourceUsageMap: used.map((sourceId) => ({
      sourceId,
      title: `Source ${sourceId}`,
      bucketIds: [`only_bucket_${((sourceId - 1) % 3) + 1}`],
      sourceClass: "policy_research",
      usageType: "fact_extracted",
      extractedClaim: `Detailed evidence claim ${sourceId} about Indian parliamentary regulation of political advertising and deepfakes.`,
      confidence: "medium",
      method: "deterministic_extraction",
    })),
    sourceUsageCount: used.length,
    sourceUsageRequirementSatisfied: true,
    output: {},
  }, registry, contract, 30);

  assert.equal(report.passed, true);
  assert.equal(report.structuredFailures.some((failure) => failure.type === "insufficient_bucket_coverage"), false);
});

test("diversity gate does not require more buckets than the registry retrieved", async () => {
  const { runSourceDiversityGate } = await import("../../src/core/quality-gate/source-diversity-gate.js");
  const { MODE_THRESHOLDS } = await import("../../src/core/quality-gate/mode-thresholds.js");
  const contract = buildAgendaContract({
    requestId: "bucket-available",
    originalUserQuery: "Council research on election advertising",
    outputDepth: "detailed",
  });
  const sources = Array.from({ length: 120 }, (_, index) => ({
    id: index + 1,
    title: `Source ${index + 1}`,
    url: `https://example.org/${index + 1}`,
    canonicalUrl: `https://example.org/${index + 1}`,
    domain: "example.org",
    bucketIds: [`bucket_${(index % 6) + 1}`],
    sourceClass: "policy_research" as const,
    authorityScore: 80,
    date: "2024-01-01",
    fullText: `Full extraction body ${index + 1} about Indian parliamentary advertising regulation and deepfake oversight with enough substance.`,
    snippet: `Full extraction body ${index + 1} about Indian parliamentary advertising regulation and deepfake oversight with enough substance.`,
    extractionQuality: "full" as const,
    keyFacts: [`Full extraction body ${index + 1} about Indian parliamentary advertising regulation and deepfake oversight with enough substance.`],
    keyNumbers: [],
    legalHoldings: [],
    namedEntities: [],
    limitations: [],
    confidence: "medium" as const,
    citationEligible: true,
    citationStrength: "medium" as const,
    limitedSource: false,
    topChunks: [],
  }));
  const registry = buildEvidenceRegistryFromSources(sources, contract);
  const cited = sources.slice(0, 110).map((source) => source.id);
  const result = runSourceDiversityGate(
    {
      finalText: cited.map((id) => `[Source ${id}](https://example.org/${id})`).join(" "),
      contract,
      registry,
      input: {
        mode: "council",
        uniqueCitedSourceIds: cited,
        citedBucketIds: [...new Set(cited.flatMap((id) => registry.getSource(id)?.bucketIds ?? []))],
      } as any,
    },
    MODE_THRESHOLDS.council,
  );
  assert.equal(result.issues.filter((issue) => issue.code === "bucket_concentration").length, 0);
  assert.equal((result.metrics as any).effectiveMinBuckets, 6);
});
