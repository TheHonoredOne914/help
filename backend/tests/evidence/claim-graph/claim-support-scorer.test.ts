import test from "node:test";
import assert from "node:assert/strict";
import { buildValidatedGraph } from "./helpers.js";

test("supportScore ranks validated full-text claims above snippet-only contextual claims", () => {
  const { claimGraph } = buildValidatedGraph();
  const validated = claimGraph.claims.find((claim) => claim.validationStatus === "approved" && claim.extractionQuality === "full");
  const snippet = claimGraph.claims.find((claim) => claim.extractionQuality === "snippet" || claim.extractionQuality === "title_only");
  assert.ok((validated?.supportScore ?? 0) > (snippet?.supportScore ?? 0));
});
