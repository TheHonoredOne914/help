import test from "node:test";
import assert from "node:assert/strict";
import { selectCardsForRole } from "../../../src/core/synthesis/role-generation/role-card-selector.js";
import { makeCard, makePacks, testAgenda } from "./helpers.js";

test("role-specific selector favors legal and data evidence without silent retrieval critic fallback", () => {
  const legal = makeCard(1, { sourceClass: "court_primary", bucketIds: ["court_legal"], legalHoldings: ["The Court applied proportionality."], keyFacts: ["Court fact."] });
  const data = makeCard(2, { sourceClass: "academic_research", bucketIds: ["academic_research"], keyNumbers: ["42 percent"], keyFacts: ["Dataset fact."] });
  const weak = makeCard(3, { citationStrength: "weak", limitedSource: true, extractionQuality: "snippet" });
  const packs = makePacks([weak, data, legal]);

  assert.equal(selectCardsForRole("legal_analyst", packs, [weak, data, legal], testAgenda())[0]?.sourceId, 1);
  assert.equal(selectCardsForRole("data_analyst", packs, [weak, data, legal], testAgenda())[0]?.sourceId, 2);
  assert.equal(selectCardsForRole("unknown_role", packs, [weak, data, legal], testAgenda())[0]?.sourceId, 1);
});
