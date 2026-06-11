import test from "node:test";
import assert from "node:assert/strict";
import { buildLegacyClaimGraphContext } from "../../../src/core/evidence/claim-graph.js";
import { buildValidatedGraph } from "./helpers.js";

test("legacy bridge applies ClaimGraph guard and marks degraded output", () => {
  const { claimGraph, evidenceRegistry } = buildValidatedGraph();
  const context = buildLegacyClaimGraphContext("Fake Case v India held EVM fraud happened and election was stolen.", claimGraph, evidenceRegistry);
  assert.equal(context.claimGraphApplied, true);
  assert.equal(context.degraded, true);
  assert.ok(context.unsupportedIssueCount > 0);
});
