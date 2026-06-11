import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources, type EvidenceSource } from "../../src/core/evidence/evidence-registry.js";
import { runModelRoleForSourceUsage } from "../../src/core/synthesis/model-role-runner.js";
import type { ProviderRouter } from "../../src/core/providers/provider-router.js";

function setup() {
  const agendaContract = buildAgendaContract({ requestId: "source-usage-provider", originalUserQuery: "India civil liberties Supreme Court Election Commission public order" });
  agendaContract.minimumEvidenceCardsPerModel = 5;
  const bucket = agendaContract.requiredSourceBuckets[0]?.bucketId ?? "government_official";
  const sources: EvidenceSource[] = Array.from({ length: 5 }, (_, index) => ({
    id: index + 1,
    title: `Source ${index + 1}`,
    url: `https://example.org/${index + 1}`,
    canonicalUrl: `https://example.org/${index + 1}`,
    domain: "example.org",
    date: "2026-01-01",
    snippet: `Distinct claim ${index + 1}`,
    fullText: `Distinct claim ${index + 1} with parliamentary utility.`,
    bucketIds: [bucket],
    sourceClass: "policy_research",
    authorityScore: 80,
    extractionQuality: "full",
    keyFacts: [`Distinct extracted claim ${index + 1}`],
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

async function run(providerName: "nvidia" | "github", model: string) {
  const { agendaContract, registry, cards } = setup();
  let seenProvider = "";
  let seenModel = "";
  const providerRouter = {
    hasProvider: (provider: string) => provider === providerName,
    completeJson: async (provider: string, request: any) => {
      seenProvider = provider;
      seenModel = request.model;
      return {
        provider,
        model: request.model,
        content: "",
        json: {
          sourceUsageMap: cards.map((card) => ({
            sourceId: card.sourceId,
            usageType: "fact_extracted",
            extractedClaim: card.keyFacts[0],
            confidence: "medium",
          })),
        },
      };
    },
  } as unknown as ProviderRouter;
  const output = await runModelRoleForSourceUsage({
    roleName: "evidence_extractor",
    evidenceCards: cards,
    evidenceRegistry: registry,
    agendaContract,
    mode: "model",
    providerRouter,
    providerName,
    model,
    minimumSourceRequirement: 5,
  });
  assert.equal(output.sourceUsageRequirementSatisfied, true);
  assert.equal(seenProvider, providerName);
  assert.equal(seenModel, model);
}

test("source usage roles can use NVIDIA", () => run("nvidia", "moonshotai/kimi-k2.6"));
test("source usage roles can use GitHub Models", () => run("github", "openai/gpt-4.1"));
