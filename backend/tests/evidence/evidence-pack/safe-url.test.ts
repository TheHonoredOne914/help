import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidencePacks } from "../../../src/core/evidence/evidence-pack-builder.js";
import { safeHostname } from "../../../src/core/evidence/evidence-pack/safe-url.js";
import { registryWith, testContract, testSource } from "./helpers.js";

test("B14-15 malformed URLs do not crash pack creation", () => {
  assert.equal(safeHostname("not a url"), "unknown");
  const contract = testContract();
  const registry = registryWith([
    testSource({ url: "not a url", canonicalUrl: "not a url", domain: "unknown", title: "Malformed URL source" }),
    testSource({ url: "https://pib.gov.in/source-2", bucketIds: ["government_official"], sourceClass: "official_government", citationStrength: "strong" }),
  ], contract);

  assert.doesNotThrow(() => buildEvidencePacks(registry, contract, { query: contract.normalizedAgenda, mode: "fast_research" }));
});
