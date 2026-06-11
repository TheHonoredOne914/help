import test from "node:test";
import assert from "node:assert/strict";
import { buildCoreAnswerUserPrompt } from "../../../src/core/generation/core-answer-prompt.js";
import { buildClaimGraph } from "../../../src/core/evidence/claim-graph.js";
import { buildEvidencePacks } from "../../../src/core/evidence/evidence-pack-builder.js";
import { registryWith, testContract, testSource } from "./helpers.js";

test("B14-12 final prompt uses one source representation and avoids duplicate Source entries", () => {
  const contract = testContract("Election Commission Article 19");
  const registry = registryWith([
    testSource({ url: "https://eci.gov.in/source-1", bucketIds: ["electoral_integrity"], sourceClass: "electoral_body", citationStrength: "strong" }),
    testSource({ url: "https://sci.gov.in/source-2", bucketIds: ["court_legal"], sourceClass: "court_primary", citationStrength: "strong" }),
  ], contract);
  const evidencePacks = Object.values(buildEvidencePacks(registry, contract, { query: contract.normalizedAgenda, mode: "deep_research" }));
  const prompt = buildCoreAnswerUserPrompt({
    requestId: "dedupe",
    userQuery: contract.normalizedAgenda,
    mode: "deep_research",
    agendaContract: contract,
    evidenceRegistry: registry,
    evidencePacks,
    claimGraph: buildClaimGraph(registry, contract, { evidencePacks }),
    sourceUsageMaps: [],
  });

  assert.doesNotMatch(prompt, /EvidenceRegistry:[\s\S]*EvidencePacks:/);
  assert.equal((prompt.match(/\[Source 1\]/g) ?? []).length, 1);
  assert.equal((prompt.match(/\[Source 2\]/g) ?? []).length, 1);
});
