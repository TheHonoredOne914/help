import test from "node:test";
import assert from "node:assert/strict";
import { runTargetedRepair } from "../../../src/core/verification/repair-orchestrator.js";
import { buildEvidencePacks } from "../../../src/core/evidence/evidence-pack-builder.js";
import { registryWith, testContract, testSource } from "./helpers.js";

test("B14-09 citation repair uses evidence packs and removes missing source IDs", async () => {
  const contract = testContract("Election Commission evidence");
  const registry = registryWith([testSource({
    title: "Election Commission official note",
    url: "https://eci.gov.in/source-1",
    bucketIds: ["electoral_integrity", "government_official"],
    sourceClass: "electoral_body",
    keyFacts: ["The Election Commission note supports a cautious official defence."],
    citationStrength: "strong",
  })], contract);
  const packs = Object.values(buildEvidencePacks(registry, contract, { query: contract.normalizedAgenda, mode: "fast_research" }));

  const repaired = await runTargetedRepair("The claim is proven [Source 999](https://fake.example).", contract, packs, "citation_repair");

  assert.doesNotMatch(repaired, /Source 999/);
  assert.match(repaired, /Source gap: all original citations were stripped/);
});
