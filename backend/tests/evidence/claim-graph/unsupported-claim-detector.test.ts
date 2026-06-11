import test from "node:test";
import assert from "node:assert/strict";
import { detectUnsupportedClaims } from "../../../src/core/evidence/claim-graph.js";
import { buildValidatedGraph } from "./helpers.js";

test("unsupported score detection requires the specific numeric value", () => {
  const { claimGraph, evidenceRegistry } = buildValidatedGraph();
  const supported = detectUnsupportedClaims("India scored 66.2 in the index.", claimGraph, evidenceRegistry);
  const unsupported = detectUnsupportedClaims("India scored 99.9 in the index.", claimGraph, evidenceRegistry);
  assert.equal(supported.some((issue) => issue.type === "unsupported_score"), false);
  assert.equal(unsupported.some((issue) => issue.type === "unsupported_score" && issue.requiredValue === "99.9"), true);
});
