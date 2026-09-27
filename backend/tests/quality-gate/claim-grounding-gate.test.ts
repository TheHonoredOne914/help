import test from "node:test";
import assert from "node:assert/strict";
import { runClaimGroundingGate } from "../../src/core/quality-gate/claim-grounding-gate.js";
import { MODE_THRESHOLDS } from "../../src/core/quality-gate/mode-thresholds.js";

function ctx(unsupported: Array<{ type: string; claim: string; action?: string }>) {
  return {
    finalText: "Treasury Bench and Opposition debate the motion.",
    contract: {} as any,
    registry: {} as any,
    input: {
      uniqueCitedSourceIds: [1],
      citedBucketIds: ["court_legal"],
      modelRoleOutputs: [],
      claimGraph: {
        claims: [{ text: "grounded claim", supportingSourceIds: [1] }],
        unsupportedClaims: unsupported,
      },
      claimLedger: {
        items: [{ sourceId: 1, citationCreditEligible: true, evidenceSpan: { text: "span" } }],
      },
    },
  } as any;
}

test("fast mode does not fatal unsupported_rank, unsupported_score, or source_gap", () => {
  assert.equal(MODE_THRESHOLDS.fast_research.requireClaimGrounding, false);
  const result = runClaimGroundingGate(ctx([
    { type: "unsupported_rank", claim: "rank 1", action: "source_gap" },
    { type: "unsupported_score", claim: "score 99.9", action: "source_gap" },
    { type: "source_gap", claim: "missing bucket", action: "source_gap" },
  ]), MODE_THRESHOLDS.fast_research);
  assert.equal(result.issues.some((issue) => issue.severity === "fatal"), false);
});

test("fast mode still fatals hard-fail fraud claims", () => {
  const result = runClaimGroundingGate(ctx([
    { type: "unsupported_fraud_claim", claim: "votes were stolen", action: "hard_fail" },
  ]), MODE_THRESHOLDS.fast_research);
  assert.ok(result.issues.some((issue) => issue.severity === "fatal" && /votes were stolen/.test(issue.message)));
});

test("deep mode still fatals unsupported_rank and unsupported_score", () => {
  assert.equal(MODE_THRESHOLDS.deep_research.requireClaimGrounding, true);
  const result = runClaimGroundingGate(ctx([
    { type: "unsupported_rank", claim: "rank 1", action: "source_gap" },
    { type: "unsupported_score", claim: "score 99.9", action: "source_gap" },
  ]), MODE_THRESHOLDS.deep_research);
  assert.ok(result.issues.some((issue) => issue.severity === "fatal" && /rank 1/.test(issue.message)));
  assert.ok(result.issues.some((issue) => issue.severity === "fatal" && /score 99.9/.test(issue.message)));
});
