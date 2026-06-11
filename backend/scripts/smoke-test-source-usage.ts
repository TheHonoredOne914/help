import { buildAgendaContract } from "../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources, type EvidenceSource } from "../src/core/evidence/evidence-registry.js";
import { runModelRoleForSourceUsage } from "../src/core/synthesis/model-role-runner.js";
import { ProviderRouter } from "../src/core/providers/provider-router.js";
import type { ModelProvider, ProviderRequest, ProviderResponse } from "../src/core/providers/provider-types.js";

const allowDeterministic = process.argv.includes("--allow-deterministic");
const hasProviderKey = Boolean(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY);

const agendaContract = buildAgendaContract({
  requestId: "smoke-source-usage",
  originalUserQuery: "Indian Mock Parliament debate on civil liberties, elections, media freedom, and constitutional accountability",
});
agendaContract.minimumEvidenceCardsPerModel = 30;

const sources: EvidenceSource[] = Array.from({ length: 30 }, (_, index) => {
  const id = index + 1;
  const bucketIds = agendaContract.requiredSourceBuckets[index % agendaContract.requiredSourceBuckets.length]?.bucketId
    ? [agendaContract.requiredSourceBuckets[index % agendaContract.requiredSourceBuckets.length].bucketId]
    : ["official_government" as const];
  return {
    id,
    title: `Smoke evidence source ${id}`,
    url: `https://example.org/source-${id}`,
    canonicalUrl: `https://example.org/source-${id}`,
    domain: "example.org",
    date: "2025-01-01",
    snippet: `Source ${id} reports a concrete parliamentary evidence point with ${20 + id}% relevance to civil liberties and accountability.`,
    fullText: `Source ${id} reports a concrete parliamentary evidence point with ${20 + id}% relevance to civil liberties and accountability. The text gives a usable factual claim for debate.`,
    bucketIds,
    sourceClass: id % 10 === 0 ? "court_primary" : "policy_research",
    authorityScore: 8,
    extractionQuality: "full",
    keyFacts: [`Source ${id} states a distinct factual claim about democratic accountability.`],
    keyNumbers: [`${20 + id}%`],
    legalHoldings: id % 10 === 0 ? [`Court source ${id} frames a proportionality holding.`] : [],
    limitations: [`Smoke source ${id} is synthetic test evidence.`],
    citationEligible: true,
    confidence: "medium",
  };
});

class SmokeProvider implements ModelProvider {
  readonly name = "gemini" as const;

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const ids = [...request.messages.at(-1)!.content.matchAll(/SourceId:\s*(\d+)/g)].map((match) => Number(match[1]));
    return {
      provider: this.name,
      model: request.model,
      content: JSON.stringify({
        sourceUsageMap: ids.map((sourceId) => ({
          sourceId,
          usageType: "fact_extracted",
          extractedClaim: `Source ${sourceId} states a distinct factual claim about democratic accountability.`,
          confidence: "medium",
        })),
      }),
    };
  }
}

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
})).slice(0, 30);
const router = new ProviderRouter();
router.register(new SmokeProvider());

if (!hasProviderKey) {
  console.log("provider configuration warning: no live provider keys detected; using local smoke provider only");
}

const output = await runModelRoleForSourceUsage({
  roleName: "smoke_source_usage",
  evidenceCards: cards,
  evidenceRegistry: registry,
  agendaContract,
  mode: "model",
  providerRouter: router,
  providerName: "gemini",
  model: "smoke-json-provider",
  minimumSourceRequirement: 30,
  allowDeterministicExtractionFallback: allowDeterministic,
});

console.log(JSON.stringify({
  providerHealth: { healthyProviders: ["gemini"], warning: hasProviderKey ? null : "no live provider keys configured" },
  assignedSources: cards.map((card) => card.sourceId),
  validUsedSources: output.usedSourceIds,
  invalidItems: output.sourceUsageMap.length - output.usedSourceIds.length,
  retries: output.retries ?? 0,
  sourceUsageRequirementSatisfied: output.sourceUsageRequirementSatisfied,
  failureReport: output.sourceUsageFailureReport ?? null,
}, null, 2));
