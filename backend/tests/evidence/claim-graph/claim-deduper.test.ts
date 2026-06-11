import test from "node:test";
import assert from "node:assert/strict";
import { buildValidatedGraph } from "./helpers.js";

test("duplicate claims merge into one multi-source claim when text overlaps", () => {
  const { claimGraph } = buildValidatedGraph();
  const evmClaims = claimGraph.claims.filter((claim) => /EVM transparency safeguards are secure/i.test(claim.text));
  assert.equal(evmClaims.length, 1);
  assert.ok(evmClaims[0].supportingSourceIds.length >= 1);
});
