import test from "node:test";
import assert from "node:assert/strict";
import { buildValidatedGraph } from "./helpers.js";

test("rejected SourceUsageMap sources do not produce strong claims", () => {
  const { claimGraph } = buildValidatedGraph();
  const rejectedClaims = claimGraph.claims.filter((claim) => claim.supportingSourceIds.includes(5));
  assert.ok(rejectedClaims.every((claim) => (claim.supportScore ?? 0) < 60));
});
