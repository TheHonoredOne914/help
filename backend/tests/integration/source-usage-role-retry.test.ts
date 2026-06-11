import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources, type EvidenceSource } from "../../src/core/evidence/evidence-registry.js";
import { runModelRoleForSourceUsage } from "../../src/core/synthesis/model-role-runner.js";
import type { ProviderRouter } from "../../src/core/providers/provider-router.js";

function setup() {
  const agendaContract = buildAgendaContract({ requestId: "retry-integration", originalUserQuery: "India parliament evidence source usage retry" });
  agendaContract.minimumEvidenceCardsPerModel = 10;
  const buckets = agendaContract.requiredSourceBuckets.map((bucket) => bucket.bucketId);
  const sources: EvidenceSource[] = Array.from({ length: 10 }, (_, index) => ({
    id: index + 1,
    title: `Source ${index + 1}`,
    url: `https://example.org/${index + 1}`,
    canonicalUrl: `https://example.org/${index + 1}`,
    domain: "example.org",
    date: "2025-01-01",
    snippet: `Claim ${index + 1}`,
    fullText: `Claim ${index + 1}`,
    bucketIds: [buckets[index % buckets.length]],
    sourceClass: "policy_research",
    authorityScore: 8,
    extractionQuality: "full",
    keyFacts: [`Claim ${index + 1}`],
    keyNumbers: [],
    legalHoldings: [],
    limitations: [`Limitation ${index + 1}`],
    citationEligible: true,
    confidence: "medium",
  }));
  const registry = buildEvidenceRegistryFromSources(sources, agendaContract);
  const cards = sources.map((source) => ({
    sourceId: source.id,
    title: source.title,
    bucketIds: source.bucketIds,
    sourceClass: source.sourceClass,
    keyFacts: source.keyFacts,
    keyNumbers: source.keyNumbers,
    legalHoldings: source.legalHoldings,
    limitations: source.limitations,
    debateUse: source.snippet ?? "",
  }));
  return { agendaContract, registry, cards };
}

test("first invalid batch retries with stricter prompt", async () => {
  const { agendaContract, registry, cards } = setup();
  let calls = 0;
  const providerRouter = {
    hasProvider: (name: string) => name === "gemini",
    complete: async (_provider: string, request: any) => {
      calls += 1;
      const ids = [...request.messages.at(-1).content.matchAll(/SourceId:\s*(\d+)/g)].map((match: RegExpMatchArray) => Number(match[1]));
      const strict = request.messages[0].content.includes("STRICT RETRY");
      return {
        provider: "gemini",
        model: "test",
        content: JSON.stringify({ sourceUsageMap: ids.map((sourceId: number) => (strict || calls > 2)
          ? { sourceId, usageType: "fact_extracted", extractedClaim: `Claim ${sourceId}`, confidence: "medium" }
          : { sourceId, usageType: "supports_claim", confidence: "medium" }) }),
      };
    },
  } as unknown as ProviderRouter;
  const output = await runModelRoleForSourceUsage({ roleName: "retry_role", evidenceCards: cards, evidenceRegistry: registry, agendaContract, mode: "model", providerRouter, providerName: "gemini", model: "test", minimumSourceRequirement: 10, batchSize: 5 });
  assert.ok(calls >= 3);
  assert.equal(output.sourceUsageRequirementSatisfied, true);
});

test("unhealthy provider is skipped and fallback provider is used", async () => {
  const { agendaContract, registry, cards } = setup();
  const seenProviders: string[] = [];
  const providerRouter = {
    hasProvider: (name: string) => name === "gemini",
    complete: async (provider: string, request: any) => {
      seenProviders.push(provider);
      const ids = [...request.messages.at(-1).content.matchAll(/SourceId:\s*(\d+)/g)].map((match: RegExpMatchArray) => Number(match[1]));
      return { provider, model: "gemini", content: JSON.stringify({ sourceUsageMap: ids.map((sourceId: number) => ({ sourceId, usageType: "fact_extracted", extractedClaim: `Claim ${sourceId}`, confidence: "medium" })) }) };
    },
  } as unknown as ProviderRouter;
  const output = await runModelRoleForSourceUsage({ roleName: "fallback_role", evidenceCards: cards, evidenceRegistry: registry, agendaContract, mode: "model", providerRouter, providerName: "groq", model: "bad", minimumSourceRequirement: 10, fallbackModels: [{ providerName: "gemini", model: "gemini-test" }], autoFallback: true });
  assert.deepEqual([...new Set(seenProviders)], ["gemini"]);
  assert.equal(output.providerUsed, "gemini");
});

test("failure report is created if all retries fail", async () => {
  const { agendaContract, registry, cards } = setup();
  const providerRouter = {
    hasProvider: () => true,
    complete: async () => ({ provider: "gemini", model: "test", content: JSON.stringify({ sourceUsageMap: [] }) }),
  } as unknown as ProviderRouter;
  const output = await runModelRoleForSourceUsage({ roleName: "failed_role", evidenceCards: cards, evidenceRegistry: registry, agendaContract, mode: "model", providerRouter, providerName: "gemini", model: "test", minimumSourceRequirement: 10 });
  assert.equal(output.sourceUsageRequirementSatisfied, false);
  assert.ok(output.sourceUsageFailureReport);
});

test("source usage role passes timeout budget to provider requests", async () => {
  const { agendaContract, registry, cards } = setup();
  const timeoutValues: number[] = [];
  const providerRouter = {
    hasProvider: () => true,
    complete: async (_provider: string, request: any) => {
      timeoutValues.push(request.timeoutMs);
      const ids = [...request.messages.at(-1).content.matchAll(/SourceId:\s*(\d+)/g)].map((match: RegExpMatchArray) => Number(match[1]));
      return {
        provider: "gemini",
        model: "test",
        content: JSON.stringify({ sourceUsageMap: ids.map((sourceId: number) => ({ sourceId, usageType: "fact_extracted", extractedClaim: `Claim ${sourceId}`, confidence: "medium" })) }),
      };
    },
  } as unknown as ProviderRouter;

  await runModelRoleForSourceUsage({
    roleName: "timeout_role",
    evidenceCards: cards,
    evidenceRegistry: registry,
    agendaContract,
    mode: "model",
    providerRouter,
    providerName: "gemini",
    model: "test",
    minimumSourceRequirement: 10,
    sourceUsageTimeoutMs: 1234,
  });

  assert.ok(timeoutValues.length > 0);
  assert.ok(timeoutValues.every((value) => value === 1234));
});
