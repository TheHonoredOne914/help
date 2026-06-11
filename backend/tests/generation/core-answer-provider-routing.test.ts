import test from "node:test";
import { buildSourceUsageMapFromRegistry } from "../../src/core/evidence/source-usage-map.js";
import assert from "node:assert/strict";
import fixtureSources from "../fixtures/india-democracy-sources.json" with { type: "json" };
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildClaimGraph } from "../../src/core/evidence/claim-graph.js";
import { buildEvidencePacks } from "../../src/core/evidence/evidence-pack-builder.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { generateCoreResearchAnswer } from "../../src/core/generation/core-answer-generator.js";
import type { ProviderRouter } from "../../src/core/providers/provider-router.js";

function setup() {
  const agendaContract = buildAgendaContract({ requestId: "provider-routing", originalUserQuery: "India democratic space 2022 2025 Supreme Court Election Commission rights federalism" });
  const evidenceRegistry = buildEvidenceRegistryFromSources(fixtureSources as any, agendaContract);
  const evidencePacks = Object.values(buildEvidencePacks(evidenceRegistry, agendaContract));
  const claimGraph = buildClaimGraph(evidenceRegistry, agendaContract);
  return { agendaContract, evidenceRegistry, evidencePacks, claimGraph };
}

async function run(providerName: "nvidia" | "github", model: string) {
  const { agendaContract, evidenceRegistry, evidencePacks, claimGraph } = setup();
  const ids = evidenceRegistry.getCitationEligibleSources().slice(0, 30).map((source) => source.id);
  const citations = ids.map((id) => evidenceRegistry.getCitationMarkdown(id)).join(" ");
  let seenProvider = "";
  let seenModel = "";
  const providerRouter = {
    complete: async (provider: string, request: any) => {
      seenProvider = provider;
      seenModel = request.model;
      return {
        provider,
        model: request.model,
        content: `# Executive Thesis\nIndian Mock Parliament thesis with Treasury Bench, Opposition, POIs, rebuttals, motions, amendments, court doctrine and final strategic synthesis. ${citations}\n\n## Methodology and Source Base\nSources are cited properly.\n\n## Indian Mock Parliament Debate Utility Arsenal\nTreasury Bench and Opposition lines.\nAmendment: Clause: 1.\n\n## Final Strategic Synthesis\nDo not summarize; diagnose the central contradiction. Diagnosis: test. Prescription: test. Warning: test.`,
      };
    },
  } as unknown as ProviderRouter;

  await generateCoreResearchAnswer({
    requestId: `${providerName}-generation`,
    userQuery: agendaContract.originalUserQuery,
    mode: providerName === "github" ? "fast_research" : "deep_research",
    agendaContract,
    evidenceRegistry,
    evidencePacks,
    claimGraph,
    sourceUsageMaps: [buildSourceUsageMapFromRegistry("evidence_extractor", evidenceRegistry, agendaContract, providerName === "github" ? 8 : 30)],
    allowSyntheticSourceUsage: true,
    generationMode: "model",
    providerRouter,
    providerName,
    trustRegisteredProvidersWithoutStatus: true,
    model,
    providerCallTimeoutMs: 1234,
  });

  assert.equal(seenProvider, providerName);
  assert.equal(seenModel, model);
}

test("core answer generation routes NVIDIA model-backed generation", () => run("nvidia", "moonshotai/kimi-k2.6"));
test("core answer generation routes GitHub model-backed generation", () => run("github", "openai/gpt-4.1"));
