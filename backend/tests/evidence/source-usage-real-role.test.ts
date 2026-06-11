import test from "node:test";
import assert from "node:assert/strict";
import fixtureSources from "../fixtures/india-democracy-sources.json" with { type: "json" };
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidencePacks } from "../../src/core/evidence/evidence-pack-builder.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { validateSourceUsageMap } from "../../src/core/evidence/source-usage-map.js";
import { runModelRoleForSourceUsage } from "../../src/core/synthesis/model-role-runner.js";
import type { ProviderRouter } from "../../src/core/providers/provider-router.js";

function setup() {
  const agendaContract = buildAgendaContract({ requestId: "usage-role", originalUserQuery: "India democratic space 2022-2025 Freedom House RSF Supreme Court" });
  const evidenceRegistry = buildEvidenceRegistryFromSources(fixtureSources as any, agendaContract);
  const packs = buildEvidencePacks(evidenceRegistry, agendaContract);
  return { agendaContract, evidenceRegistry, cards: Object.values(packs).flatMap((pack) => pack.cards) };
}

test("live mode requires role-generated SourceUsageMap and rejects fake role output", async () => {
  const { agendaContract, evidenceRegistry, cards } = setup();
  const providerRouter = {
    complete: async () => ({
      provider: "groq",
      model: "test",
      content: JSON.stringify({ sourceUsageMap: [{ sourceId: 999, usageType: "supports_claim", extractedClaim: "fake", confidence: "high" }] }),
    }),
  } as unknown as ProviderRouter;

  const output = await runModelRoleForSourceUsage({
    roleName: "evidence_extractor",
    evidenceCards: cards.slice(0, 10),
    evidenceRegistry,
    agendaContract,
    mode: "model",
    providerRouter,
    providerName: "groq",
    model: "test",
    minimumSourceRequirement: 5,
  });
  assert.equal(output.sourceUsageRequirementSatisfied, false);
  assert.match(output.failureReason ?? "", /fake source id|source usage validation|fewer/i);
});

test("model role batches merge to real 30-source usage", async () => {
  const { agendaContract, evidenceRegistry, cards } = setup();
  const claimBySourceId = new Map(cards.map((card) => [card.sourceId, card.keyFacts[0] ?? card.debateUse]));
  const providerRouter = {
    complete: async (_provider: string, request: any) => {
      const ids = [...request.messages.at(-1).content.matchAll(/SourceId:\s*(\d+)/g)].map((match) => Number(match[1])).slice(0, 10);
      return {
        provider: "groq",
        model: "test",
        content: JSON.stringify({
          sourceUsageMap: ids.map((sourceId) => ({ sourceId, usageType: "fact_extracted", extractedClaim: claimBySourceId.get(sourceId), confidence: "high" })),
        }),
      };
    },
  } as unknown as ProviderRouter;

  const output = await runModelRoleForSourceUsage({
    roleName: "thesis_synthesizer",
    evidenceCards: cards,
    evidenceRegistry,
    agendaContract,
    mode: "model",
    providerRouter,
    providerName: "groq",
    model: "test",
    batchSize: 10,
    minimumSourceRequirement: 30,
  });
  const report = validateSourceUsageMap(output, evidenceRegistry, agendaContract, 30);

  assert.equal(report.passed, true);
  assert.ok(report.uniqueUsedSourceCount >= 30);
});
