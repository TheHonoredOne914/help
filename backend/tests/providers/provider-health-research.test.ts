import test from "node:test";
import assert from "node:assert/strict";
import {
  getHealthyProvidersForResearch,
  type ProviderResearchStatus,
} from "../../src/core/providers/provider-health.js";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources, type EvidenceSource } from "../../src/core/evidence/evidence-registry.js";
import type { SourceBucketId } from "../../src/core/retrieval/source-buckets.js";
import { runModelRoleForSourceUsage } from "../../src/core/synthesis/model-role-runner.js";
import type { ProviderRouter } from "../../src/core/providers/provider-router.js";

test("Groq 400 marks Groq unhealthy", () => {
  const result = getHealthyProvidersForResearch({
    selectedProvider: "groq",
    selectedModel: "llama-3.3-70b-versatile",
    providerStatuses: [
      { providerName: "groq", configured: true, modelEndpointStatus: 400, supportsJsonTasks: true },
    ],
  });

  assert.deepEqual(result.healthyProviders, []);
  assert.deepEqual(result.unhealthyProviders.map((item) => item.providerName), ["groq"]);
});

test("OpenRouter 400 marks OpenRouter unhealthy", () => {
  const result = getHealthyProvidersForResearch({
    selectedProvider: "openrouter",
    selectedModel: "anthropic/claude-3.5-sonnet",
    providerStatuses: [
      { providerName: "openrouter", configured: true, modelEndpointStatus: 400, supportsJsonTasks: true },
    ],
  });

  assert.equal(result.healthyProviders.length, 0);
  assert.equal(result.unhealthyProviders[0]?.reason, "model_endpoint_unhealthy");
});

test("Gemini 200 is selected if it is the only healthy provider", () => {
  const statuses: ProviderResearchStatus[] = [
    { providerName: "groq", configured: true, modelEndpointStatus: 400, supportsJsonTasks: true },
    { providerName: "openrouter", configured: true, modelEndpointStatus: 400, supportsJsonTasks: true },
    { providerName: "gemini", configured: true, modelEndpointStatus: 200, supportsJsonTasks: true, models: ["gemini-2.5-pro"], chatVerified: true, healthy: true, status: "healthy", canChat: true },
  ];

  const result = getHealthyProvidersForResearch({
    selectedProvider: "groq",
    selectedModel: "llama-3.3-70b-versatile",
    fallbackModels: [{ providerName: "gemini", model: "gemini-2.5-pro" }],
    providerStatuses: statuses,
    autoFallback: true,
  });

  assert.equal(result.selectedProvider, "gemini");
  assert.equal(result.selectedModel, "gemini-2.5-pro");
});

test("no healthy provider returns visible provider configuration error", () => {
  const result = getHealthyProvidersForResearch({
    selectedProvider: "groq",
    selectedModel: "llama-3.3-70b-versatile",
    providerStatuses: [
      { providerName: "groq", configured: false, modelEndpointStatus: 400, supportsJsonTasks: true, error: "missing key" },
    ],
  });

  assert.equal(result.healthyProviders.length, 0);
  assert.match(result.errors.join("\n"), /No healthy research provider|missing key/i);
});

test("provider that errors is not retried repeatedly in one source usage run", async () => {
  const agendaContract = buildAgendaContract({ requestId: "provider-retry", originalUserQuery: "India source usage provider health" });
  agendaContract.minimumEvidenceCardsPerModel = 8;
  const bucket: SourceBucketId = agendaContract.requiredSourceBuckets[0]?.bucketId ?? "policy_research";
  const sources: EvidenceSource[] = Array.from({ length: 8 }, (_, index) => ({
    id: index + 1,
    title: `Source ${index + 1}`,
    url: `https://example.org/${index + 1}`,
    canonicalUrl: `https://example.org/${index + 1}`,
    domain: "example.org",
    bucketIds: [bucket],
    sourceClass: "policy_research",
    authorityScore: 80,
    date: null,
    fullText: `Claim ${index + 1}`,
    snippet: `Claim ${index + 1}`,
    extractionQuality: "full",
    keyFacts: [`Claim ${index + 1}`],
    keyNumbers: [],
    legalHoldings: [],
    namedEntities: [],
    limitations: [`Limitation ${index + 1}`],
    confidence: "medium",
    citationEligible: true,
  }));
  const registry = buildEvidenceRegistryFromSources(sources, agendaContract);
  const cards = registry.getCitationEligibleSources().map((source) => ({
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
  const providerCalls: string[] = [];
  const providerRouter = {
    hasProvider: () => true,
    complete: async (provider: string, request: any) => {
      providerCalls.push(provider);
      if (provider === "groq") throw new Error("Groq 400");
      const ids = [...request.messages.at(-1).content.matchAll(/SourceId:\s*(\d+)/g)].map((match: RegExpMatchArray) => Number(match[1]));
      return {
        provider,
        model: "gemini-2.5-pro",
        content: JSON.stringify({ sourceUsageMap: ids.map((sourceId: number) => ({ sourceId, usageType: "fact_extracted", extractedClaim: `Claim ${sourceId}`, confidence: "medium" })) }),
      };
    },
  } as unknown as ProviderRouter;

  const output = await runModelRoleForSourceUsage({
    roleName: "provider_health",
    evidenceCards: cards,
    evidenceRegistry: registry,
    agendaContract,
    mode: "model",
    providerRouter,
    providerName: "groq",
    model: "bad",
    fallbackModels: [{ providerName: "gemini", model: "gemini-2.5-pro" }],
    autoFallback: true,
    minimumSourceRequirement: 8,
  });

  assert.equal(providerCalls.filter((provider) => provider === "groq").length, 1);
  assert.equal(output.providerUsed, "gemini");
  assert.equal(output.sourceUsageRequirementSatisfied, true);
});
