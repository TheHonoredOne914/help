import test from "node:test";
import assert from "node:assert/strict";
import { selectSectionEvidence } from "../../../src/core/evidence/evidence-pack/section-evidence-selector.js";
import { buildEvidencePacks } from "../../../src/core/evidence/evidence-pack-builder.js";
import { registryWith, testContract, testSource } from "./helpers.js";

test("B14-10/B14-11 section evidence selection uses explicit mappings, not identical offsets", () => {
  const contract = testContract("AIPPM legal analysis source reliability evidence gaps");
  const registry = registryWith([
    testSource({ url: "https://sci.gov.in/source-1", bucketIds: ["court_legal"], sourceClass: "court_primary", citationStrength: "strong" }),
    testSource({ url: "https://pib.gov.in/source-2", bucketIds: ["government_official"], sourceClass: "official_government", citationStrength: "strong" }),
    testSource({ url: "https://x.com/source-3", bucketIds: [], sourceClass: "social_media", limitedSource: true, extractionQuality: "snippet", citationStrength: "weak", limitations: ["Weak allegation only."] }),
    testSource({ url: "https://prsindia.org/source-4", bucketIds: ["policy_research", "parliamentary_records"], sourceClass: "policy_research", citationStrength: "medium" }),
  ], contract);
  const packs = buildEvidencePacks(registry, contract, { query: contract.normalizedAgenda, mode: "deep_research" });
  const cards = Object.values(packs).flatMap((pack) => pack.cards);

  const legal = selectSectionEvidence("Legal Analysis", cards, { query: contract.normalizedAgenda, limit: 3 });
  const gaps = selectSectionEvidence("Evidence Gaps", cards, { query: contract.normalizedAgenda, limit: 3 });
  const reliability = selectSectionEvidence("Source Reliability Matrix", cards, { query: contract.normalizedAgenda, limit: 3 });

  assert.notDeepEqual(legal.map((card) => card.sourceId), gaps.map((card) => card.sourceId));
  assert.ok(legal.some((card) => card.bucketIds.includes("court_legal")));
  assert.ok(gaps.some((card) => card.limitedSource || card.citationStrength === "weak"));
  assert.ok(reliability.every((card) => card.citationStrength !== "ineligible"));
});
