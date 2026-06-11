import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidencePacks } from "../../../src/core/evidence/evidence-pack-builder.js";
import { registryWith, testContract, testSource } from "./helpers.js";

test("B14-06/B14-13 Brick 12 enrichmentCard, topChunks, evidenceItems, and namedEntities survive into EvidenceCard", () => {
  const contract = testContract("Supreme Court Article 19 electoral bonds");
  const registry = registryWith([testSource({
    title: "Enriched Supreme Court source",
    url: "https://www.sci.gov.in/source-1",
    bucketIds: ["court_legal"],
    sourceClass: "court_primary",
    enrichmentCard: {
      reducerName: "local",
      evidenceItems: [{ claim: "Article 19 voter information holding", kind: "legal_holding" }],
      topChunks: ["secondary legal holding chunk", "implementation detail chunk"],
    },
    namedEntities: ["Supreme Court of India", "Article 19", "Election Commission of India"],
    topChunks: [
      { text: "Primary Article 19 holding chunk.", score: 10, chunkIndex: 0 },
      { text: "Secondary statistic and implementation detail chunk.", score: 9, chunkIndex: 1 },
    ],
    citationStrength: "strong",
  })], contract);

  const packs = buildEvidencePacks(registry, contract, { query: contract.normalizedAgenda, mode: "deep_research" });
  const card = Object.values(packs).flatMap((pack) => pack.cards).find((item) => item.sourceId === 1);

  assert.ok(card);
  assert.equal(card?.enrichmentCard?.reducerName, "local");
  assert.deepEqual(card?.namedEntities, ["Supreme Court of India", "Article 19", "Election Commission of India"]);
  assert.ok((card?.evidenceItems ?? []).length >= 1);
  assert.ok((card?.topChunks ?? []).length >= 2);
});
