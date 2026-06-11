import test from "node:test";
import assert from "node:assert/strict";
import { buildValidatedGraph } from "./helpers.js";

test("India-specific claims survive token matching and prompt eligibility", () => {
  const { claimGraph } = buildValidatedGraph();
  console.log(claimGraph.claims.map(c => c.text));
  assert.ok(claimGraph.claims.some((claim) => /India/i.test(claim.text)));
  assert.ok((claimGraph.diagnostics?.promptEligibleClaimCount ?? 0) > 0);
  assert.ok((claimGraph.summary?.approvedSourceCount ?? 0) >= 4);
});
