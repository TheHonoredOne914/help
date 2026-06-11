import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidenceRegistryFromLegacySources, normalizeLegacyAuthorityScore } from "../../../src/core/evidence/evidence-pack/legacy-pack-bridge.js";
import { testContract } from "./helpers.js";

test("B14-04 legacy score normalization scales 0-10 scores and clamps to 0-100", () => {
  assert.equal(normalizeLegacyAuthorityScore(8.5), 85);
  assert.equal(normalizeLegacyAuthorityScore(0.5), 5);
  assert.equal(normalizeLegacyAuthorityScore(250), 100);
  assert.equal(normalizeLegacyAuthorityScore(-10), 0);
});

test("B14-05 legacy bridge preserves raw content for registry normalization", () => {
  const contract = testContract("Supreme Court Article 19 statistics");
  const registry = buildEvidenceRegistryFromLegacySources([{
    title: "Legacy full content",
    url: "https://legacy.example/source-1",
    score: 8.5,
    content: "The first fact discusses Article 19 transparency. The second fact gives a 47.5% statistic. The third fact identifies a limitation in the dataset.",
    bucketIds: ["court_legal"],
    sourceClass: "legal_commentary",
    date: "2024-01-01",
  }], contract);
  const source = registry.getSource(1);

  assert.equal(source?.authorityScore, 85);
  assert.ok((source?.keyFacts.length ?? 0) >= 2);
  assert.deepEqual(source?.keyNumbers, ["47.5%"]);
  assert.equal(source?.date, "2024-01-01");
});
