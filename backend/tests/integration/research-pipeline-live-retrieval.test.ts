import test from "node:test";
import assert from "node:assert/strict";
import { runResearchPipeline } from "../../src/core/pipeline/research-pipeline.js";
import { buildSourceUsageGapReport } from "../../src/core/pipeline/research-pipeline.js";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { getSourceUsagePolicy } from "../../src/core/config/source-usage-policy.js";
import type { ProviderRouter } from "../../src/core/providers/provider-router.js";

test("live retrieval path returns SourceGapReport when no search keys exist", async () => {
  const result = await runResearchPipeline({
    requestId: "live-gap",
    userQuery: "India democratic space 2022-2025",
    mode: "deep_research",
    liveRetrieval: true,
    allowMockRetrieval: false,
    allowSyntheticSourceUsage: false,
    useCoreGeneration: false,
    legacyFallback: async () => "Explicit test fallback with SourceGapReport.",
    searchOptions: { providers: ["tavily"], providerKeys: {} },
  });

  assert.equal(result.evidenceRegistry.getCitationEligibleCount(), 0);
  assert.ok(result.sourceGapReport);
  assert.equal(result.usedLegacyFallback, true);
});

test("source gap path surfaces provider failure unless fallback is explicit", async () => {
  const providerRouter = {
    hasProvider: () => true,
    completeJson: async () => ({ json: { sourceUsageMap: [] } }),
    complete: async () => {
      throw new Error("Provider test failure: invalid API key");
    },
  } as unknown as ProviderRouter;

  await assert.rejects(() => runResearchPipeline({
    requestId: "live-gap-provider-failure",
    userQuery: "India democratic space 2022-2025 press freedom",
    mode: "deep_research",
    liveRetrieval: true,
    allowMockRetrieval: false,
    allowSyntheticSourceUsage: false,
    searchOptions: { providers: ["tavily"], providerKeys: {} },
    generationMode: "model",
    providerRouter,
    providerName: "groq",
    model: "test",
  }), /Provider test failure|Core generation provider failed|provider error|legacy fallback is disabled/i);
});

test("source usage shortfall creates SourceGapReport even when enough sources were retrieved", () => {
  const contract = buildAgendaContract({
    requestId: "usage-gap",
    originalUserQuery: "UGC regulations 2026 Indian higher education academic autonomy",
    outputDepth: "brief",
  });
  contract.minimumUniqueCitedSources = 40;
  contract.minimumEvidenceCardsPerModel = 40;
  const sources = Array.from({ length: 45 }, (_, index) => ({
    title: `UGC source ${index + 1}`,
    url: `https://example.gov.in/ugc-${index + 1}`,
    canonicalUrl: `https://example.gov.in/ugc-${index + 1}`,
    domain: "example.gov.in",
    bucketIds: ["government_official"],
    sourceClass: "official_government",
    authorityScore: 80,
    date: "2026-01-01",
    fullText: `UGC regulations source ${index + 1} discusses higher education policy, academic autonomy, and implementation safeguards in India.`,
    snippet: `UGC regulations source ${index + 1}`,
    extractionQuality: "full",
    keyFacts: [`UGC regulations source ${index + 1} has contentful policy evidence.`],
    keyNumbers: [],
    legalHoldings: [],
    namedEntities: ["UGC"],
    limitations: [],
    confidence: "high",
    citationEligible: true,
  }));
  const registry = buildEvidenceRegistryFromSources(sources as any, contract);
  const report = buildSourceUsageGapReport(
    contract,
    registry,
    {
      outputs: [],
      failureReports: [],
      validUsageCount: 12,
      validUsedSourceIds: Array.from({ length: 12 }, (_, index) => index + 1),
      rolesPassed: 1,
      rolesFailed: 3,
      warningRoleCount: 3,
      passed: false,
      completedWithSourceGaps: true,
    },
    getSourceUsagePolicy("fast_research"),
    ["UGC regulations 2026 India"],
    [],
  );

  assert.ok(report);
  assert.match(report.explanation, /12\/40/);
  assert.equal(report.availableCitationEligibleSources, 45);
});
