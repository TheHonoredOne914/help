import test from "node:test";
import assert from "node:assert/strict";
import { buildValidatedGraph } from "./helpers.js";

test("ClaimGraph populates legal, official, allegation, trend, score, and rank claim types", () => {
  const types = new Set(buildValidatedGraph().claimGraph.claims.map((claim) => claim.type));
  assert.ok(types.has("legal_holding"));
  assert.ok(types.has("official_position"));
  assert.ok(types.has("allegation"));
  assert.ok(types.has("trend") || types.has("score"));
  assert.ok(types.has("rank") || types.has("score"));
});
