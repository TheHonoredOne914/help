import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { getSourceUsagePolicy } from "../../src/core/config/source-usage-policy.js";
import { validateSourceUsageMap } from "../../src/core/evidence/source-usage-map.js";
import { buildEvidenceRegistryFromSources, type EvidenceSource } from "../../src/core/evidence/evidence-registry.js";
import { runResearchPipeline } from "../../src/core/pipeline/research-pipeline.js";
import { runModelRoleForSourceUsage } from "../../src/core/synthesis/model-role-runner.js";
import type { ProviderRouter } from "../../src/core/providers/provider-router.js";

function makeSources(count: number, options: { withFacts?: boolean } = {}): EvidenceSource[] {
  const contract = buildAgendaContract({ requestId: "sources", originalUserQuery: "India parliament source usage" });
  const buckets = contract.requiredSourceBuckets.map((bucket) => bucket.bucketId);
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    title: `Source ${index + 1}`,
    url: `https://example.org/source-${index + 1}`,
    canonicalUrl: `https://example.org/source-${index + 1}`,
    domain: "example.org",
    bucketIds: [buckets[index % buckets.length]],
    sourceClass: "policy_research",
    authorityScore: 80,
    date: "2025-01-01",
    fullText: options.withFacts === false ? null : `Specific evidence claim ${index + 1} about Indian parliamentary debate.`,
    snippet: options.withFacts === false ? null : `Specific evidence claim ${index + 1} about Indian parliamentary debate.`,
    extractionQuality: options.withFacts === false ? "failed" : "full",
    keyFacts: options.withFacts === false ? [] : [`Specific evidence claim ${index + 1}`],
    keyNumbers: index % 3 === 0 ? [`${2020 + (index % 5)}`] : [],
    legalHoldings: [],
    namedEntities: [],
    limitations: options.withFacts === false ? ["No extractable text was available."] : [`Limitation ${index + 1}`],
    confidence: "medium",
    citationEligible: true,
  }));
}

function setup(count = 10, options: { withFacts?: boolean } = {}) {
  const agendaContract = buildAgendaContract({ requestId: "usage-policy", originalUserQuery: "India parliament source usage evidence" });
  const sources = makeSources(count, options);
  const evidenceRegistry = buildEvidenceRegistryFromSources(sources, agendaContract);
  const cards = evidenceRegistry.getCitationEligibleSources().map((source) => ({
    sourceId: source.id,
    citation: `[Source ${source.id}](${source.url})`,
    title: source.title,
    url: source.url,
    sourceClass: source.sourceClass,
    bucketIds: source.bucketIds,
    date: source.date,
    relevanceScore: source.authorityScore,
    keyFacts: source.keyFacts,
    keyNumbers: source.keyNumbers,
    legalHoldings: source.legalHoldings,
    governmentPosition: null,
    civilLibertiesPosition: null,
    electoralIntegrityPosition: null,
    debateUse: source.keyFacts[0] ?? "",
    limitations: source.limitations,
    usableSections: source.bucketIds,
  }));
  return { agendaContract, evidenceRegistry, cards, sources };
}

test("listing-only SourceUsageMap still fails strict validation", () => {
  const { agendaContract, evidenceRegistry } = setup(10);
  const sourceIds = evidenceRegistry.getCitationEligibleSources().map((source) => source.id);
  const report = validateSourceUsageMap({
    roleName: "listing_only",
    requiredSourceCount: 10,
    receivedSourceIds: sourceIds,
    usedSourceIds: sourceIds,
    unusedSourceIds: [],
    sourceUsageMap: sourceIds.map((sourceId) => ({
      sourceId,
      title: `Source ${sourceId}`,
      bucketIds: evidenceRegistry.getSource(sourceId)?.bucketIds ?? [],
      sourceClass: evidenceRegistry.getSource(sourceId)?.sourceClass ?? "policy_research",
      usageType: "supports_claim",
      confidence: "medium",
    })),
    sourceUsageCount: sourceIds.length,
    sourceUsageRequirementSatisfied: true,
    output: {},
  }, evidenceRegistry, agendaContract, 10);

  assert.equal(report.passed, false);
  assert.match(report.failures.join("\n"), /without actual extraction|fewer than 10/i);
});

test("invalid model output retries, then deterministic evidence extraction passes when allowed", async () => {
  const { agendaContract, evidenceRegistry, cards } = setup(10);
  let calls = 0;
  const providerRouter = {
    hasProvider: () => true,
    complete: async () => {
      calls += 1;
      return {
        provider: "gemini",
        model: "test",
        content: JSON.stringify({ sourceUsageMap: cards.map((card) => ({ sourceId: card.sourceId, usageType: "supports_claim", confidence: "medium" })) }),
      };
    },
  } as unknown as ProviderRouter;

  const output = await runModelRoleForSourceUsage({
    roleName: "deterministic_allowed",
    evidenceCards: cards,
    evidenceRegistry,
    agendaContract,
    mode: "model",
    providerRouter,
    providerName: "gemini",
    model: "test",
    minimumSourceRequirement: 10,
    allowDeterministicExtractionFallback: true,
  });

  assert.ok(calls >= 2);
  assert.equal(output.sourceUsageRequirementSatisfied, true);
  assert.equal(output.sourceUsageMap.every((item) => item.method === "deterministic_extraction"), true);
  assert.equal(output.sourceUsageMap.every((item) => Boolean(item.extractedClaim || item.extractedNumber || item.legalHolding || item.limitation)), true);
});

test("source usage output counts only validation-valid evidence uses", async () => {
  const { agendaContract, evidenceRegistry, cards } = setup(10);
  const providerRouter = {
    hasProvider: () => true,
    complete: async () => ({
      provider: "gemini",
      model: "test",
      content: JSON.stringify({
        sourceUsageMap: cards.map((card, index) => index < 3
          ? {
              sourceId: card.sourceId,
              usageType: "fact_extracted",
              extractedClaim: card.keyFacts[0],
              confidence: "medium",
            }
          : {
              sourceId: card.sourceId,
              usageType: "relevant_but_weak",
              limitation: "Useful background, but not strong enough for a cited claim.",
              confidence: "low",
            }),
      }),
    }),
  } as unknown as ProviderRouter;

  const output = await runModelRoleForSourceUsage({
    roleName: "partial_valid_usage",
    evidenceCards: cards,
    evidenceRegistry,
    agendaContract,
    mode: "model",
    providerRouter,
    providerName: "gemini",
    model: "test",
    minimumSourceRequirement: 3,
    allowDeterministicExtractionFallback: false,
  });

  assert.equal(output.sourceUsageRequirementSatisfied, true);
  assert.deepEqual(output.usedSourceIds.sort((a, b) => a - b), [1, 2, 3]);
  assert.equal(output.sourceUsageCount, 3);
});

test("deterministic extraction fallback respects mode minimum instead of forcing 30", async () => {
  const { agendaContract, evidenceRegistry, cards } = setup(10);
  const providerRouter = {
    hasProvider: () => true,
    complete: async () => ({ provider: "gemini", model: "test", content: JSON.stringify({ sourceUsageMap: [] }) }),
  } as unknown as ProviderRouter;

  const output = await runModelRoleForSourceUsage({
    roleName: "fast_minimum_fallback",
    evidenceCards: cards,
    evidenceRegistry,
    agendaContract,
    mode: "model",
    providerRouter,
    providerName: "gemini",
    model: "test",
    minimumSourceRequirement: 3,
    allowDeterministicExtractionFallback: true,
  });

  assert.equal(output.sourceUsageRequirementSatisfied, true);
  assert.equal(output.sourceUsageMap.length, 3);
  assert.equal(output.sourceUsageCount, 3);
});

test("deterministic fallback marks textless cards weak instead of creating fake claims", async () => {
  const { agendaContract, evidenceRegistry, cards } = setup(5, { withFacts: false });
  const providerRouter = {
    hasProvider: () => true,
    complete: async () => ({ provider: "gemini", model: "test", content: JSON.stringify({ sourceUsageMap: [] }) }),
  } as unknown as ProviderRouter;

  const output = await runModelRoleForSourceUsage({
    roleName: "weak_cards",
    evidenceCards: cards,
    evidenceRegistry,
    agendaContract,
    mode: "model",
    providerRouter,
    providerName: "gemini",
    model: "test",
    minimumSourceRequirement: 5,
    allowDeterministicExtractionFallback: true,
  });

  assert.equal(output.sourceUsageRequirementSatisfied, false);
  assert.equal(output.sourceUsageMap.every((item) => item.usageType === "relevant_but_weak"), true);
  assert.equal(output.sourceUsageMap.every((item) => !item.extractedClaim), true);
});

test("source usage policy keeps web and fast lighter than phd/full", () => {
  assert.equal(getSourceUsagePolicy("web_search").requiredSources, 10);
  assert.equal(getSourceUsagePolicy("fast_research").strictFailure, false);
  assert.equal(getSourceUsagePolicy("deep_research").allowCompletedWithSourceGaps, true);
  assert.equal(getSourceUsagePolicy("deep_research").strictFailure, true);
  assert.equal(getSourceUsagePolicy("council").minimumToProceed, 25);
});

test("fast research can complete with source gaps when source usage role fails", async () => {
  const { sources } = setup(5);
  const providerRouter = {
    hasProvider: () => true,
    complete: async () => ({ provider: "gemini", model: "test", content: JSON.stringify({ sourceUsageMap: [] }) }),
  } as unknown as ProviderRouter;
  const previous = process.env.SOURCE_USAGE_ROLES_USE_MODEL;
  process.env.SOURCE_USAGE_ROLES_USE_MODEL = "true";
  try {
    const result = await runResearchPipeline({
      userQuery: "quick India parliament evidence",
      mode: "fast_research",
      preloadedSources: sources,
      liveRetrieval: false,
      useCoreGeneration: false,
      legacyFallback: async ({ sourceGapReport }) => `Fast answer with source gaps. ${sourceGapReport?.explanation ?? ""} [Source 1](https://example.org/source-1)`,
      generationMode: "model",
      providerRouter,
      providerName: "gemini",
      model: "test",
      allowSyntheticSourceUsage: false,
    });

    assert.ok(result.sourceGapReport);
    assert.equal(result.modelRoleOutputs.some((role) => role.sourceUsageFailureReport), true);
    assert.match(result.finalAnswer, /source gaps/i);
  } finally {
    if (previous === undefined) delete process.env.SOURCE_USAGE_ROLES_USE_MODEL;
    else process.env.SOURCE_USAGE_ROLES_USE_MODEL = previous;
  }
});

test("fast research uses deterministic source usage by default even when a provider is available", async () => {
  const { sources, cards } = setup(10);
  let providerCalls = 0;
  const providerRouter = {
    hasProvider: () => true,
    complete: async () => {
      providerCalls += 1;
      return {
        provider: "gemini",
        model: "test",
        content: JSON.stringify({
          sourceUsageMap: cards.map((card) => ({
            sourceId: card.sourceId,
            usageType: "fact_extracted",
            extractedClaim: card.keyFacts[0],
            confidence: "medium",
          })),
        }),
      };
    },
  } as unknown as ProviderRouter;
  const previous = process.env.SOURCE_USAGE_ROLES_USE_MODEL;
  delete process.env.SOURCE_USAGE_ROLES_USE_MODEL;
  try {
    const result = await runResearchPipeline({
      userQuery: "quick live India parliament evidence",
      mode: "fast_research",
      preloadedSources: sources,
      liveRetrieval: true,
      useCoreGeneration: false,
      legacyFallback: async () => "Fast answer [Source 1](https://example.org/source-1)",
      generationMode: "model",
      providerRouter,
      providerName: "gemini",
      model: "test",
      allowSyntheticSourceUsage: false,
    });

    assert.equal(providerCalls, 0);
    assert.equal(result.modelRoleOutputs.some((role) => role.roleName === "source_usage_live_guard"), false);
  } finally {
    if (previous === undefined) delete process.env.SOURCE_USAGE_ROLES_USE_MODEL;
    else process.env.SOURCE_USAGE_ROLES_USE_MODEL = previous;
  }
});

test("source usage roles skip planner-only roles and start with post-retrieval roles", async () => {
  const { sources, cards } = setup(10);
  const startedRoles: string[] = [];
  const providerRouter = {
    hasProvider: () => true,
    complete: async () => ({
      provider: "gemini",
      model: "test",
      content: JSON.stringify({
        sourceUsageMap: cards.map((card) => ({
          sourceId: card.sourceId,
          usageType: "fact_extracted",
          extractedClaim: card.keyFacts[0],
          confidence: "medium",
        })),
      }),
    }),
  } as unknown as ProviderRouter;
  const previous = process.env.SOURCE_USAGE_ROLES_USE_MODEL;
  process.env.SOURCE_USAGE_ROLES_USE_MODEL = "true";
  try {
    await runResearchPipeline({
      userQuery: "quick India parliament evidence",
      mode: "fast_research",
      preloadedSources: sources,
      liveRetrieval: false,
      useCoreGeneration: false,
      legacyFallback: async () => "Fast answer [Source 1](https://example.org/source-1)",
      generationMode: "model",
      providerRouter,
      providerName: "gemini",
      model: "test",
      allowSyntheticSourceUsage: false,
      emit: (event) => {
        if (event.type === "model_role_started") startedRoles.push(String(event.data?.roleName));
      },
    });

    assert.deepEqual(startedRoles, ["retrieval_critic", "evidence_extractor"]);
  } finally {
    if (previous === undefined) delete process.env.SOURCE_USAGE_ROLES_USE_MODEL;
    else process.env.SOURCE_USAGE_ROLES_USE_MODEL = previous;
  }
});

test("phd level fails honestly when source usage cannot be proven", async () => {
  const { sources } = setup(5);
  const providerRouter = {
    hasProvider: () => true,
    complete: async () => ({ provider: "gemini", model: "test", content: JSON.stringify({ sourceUsageMap: [] }) }),
  } as unknown as ProviderRouter;
  const previous = process.env.SOURCE_USAGE_ROLES_USE_MODEL;
  process.env.SOURCE_USAGE_ROLES_USE_MODEL = "true";
  try {
    await assert.rejects(() => runResearchPipeline({
      userQuery: "PhD India parliament evidence",
      mode: "deep_research",
      preloadedSources: sources,
      liveRetrieval: false,
      useCoreGeneration: false,
      legacyFallback: async () => "should not complete",
      generationMode: "model",
      providerRouter,
      providerName: "gemini",
      model: "test",
      allowSyntheticSourceUsage: false,
    }), /Source usage validation failed/i);
  } finally {
    if (previous === undefined) delete process.env.SOURCE_USAGE_ROLES_USE_MODEL;
    else process.env.SOURCE_USAGE_ROLES_USE_MODEL = previous;
  }
});
