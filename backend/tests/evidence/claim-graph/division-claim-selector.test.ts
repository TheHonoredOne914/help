import test from "node:test";
import assert from "node:assert/strict";
import { buildDivisionClaimGap, selectDivisionClaims } from "../../../src/core/evidence/claim-graph.js";
import { buildValidatedGraph } from "./helpers.js";

test("division selector returns relevant claims or an explicit gap instead of arbitrary first claims", () => {
  const { claimGraph } = buildValidatedGraph();
  const selected = selectDivisionClaims(claimGraph, "electoral_integrity", "Electoral Integrity", 4);
  assert.ok(selected.length > 0);
  const unrelated = selectDivisionClaims({ ...claimGraph, claims: [] }, "unrelated", "Unrelated Division", 4);
  assert.equal(unrelated.length, 0);
  assert.match(buildDivisionClaimGap("Unrelated Division"), /Source gap/);
});
