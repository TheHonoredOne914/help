import test from "node:test";
import assert from "node:assert/strict";
import { rankEvidenceCards } from "../../../src/core/evidence/evidence-pack/pack-ranking.js";
import { buildEvidencePacks } from "../../../src/core/evidence/evidence-pack-builder.js";
import { registryWith, testContract, testSource } from "./helpers.js";

test("B14-02 query relevance outranks fake authority-only relevance", () => {
  const contract = testContract("Supreme Court electoral bonds Article 19 voter information");
  const registry = registryWith([
    testSource({
      title: "High authority unrelated economic report",
      url: "https://pib.gov.in/source-1",
      bucketIds: ["government_official"],
      sourceClass: "official_government",
      authorityScore: 99,
      keyFacts: ["This source discusses fertilizer subsidy releases and procurement logistics."],
      topChunks: [{ text: "Fertilizer subsidy procurement logistics.", score: 9, chunkIndex: 0 }],
      citationStrength: "strong",
    }),
    testSource({
      title: "Electoral bonds Article 19 analysis",
      url: "https://scobserver.in/source-2",
      bucketIds: ["court_legal", "legal_commentary"],
      sourceClass: "legal_commentary",
      authorityScore: 78,
      keyFacts: ["The electoral bonds judgment links Article 19 voter information to political funding transparency."],
      topChunks: [{ text: "Electoral bonds Article 19 voter information political funding transparency.", score: 10, chunkIndex: 0 }],
      citationStrength: "medium",
    }),
  ], contract);
  const packs = buildEvidencePacks(registry, contract, { query: contract.normalizedAgenda, mode: "deep_research" });
  const ranked = rankEvidenceCards(Object.values(packs).flatMap((pack) => pack.cards), { query: contract.normalizedAgenda });

  assert.equal(ranked[0].sourceId, 2);
  assert.ok((ranked[0].queryRelevanceScore ?? 0) > (ranked[1].queryRelevanceScore ?? 0));
});
