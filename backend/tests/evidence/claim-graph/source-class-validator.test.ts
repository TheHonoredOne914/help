import test from "node:test";
import assert from "node:assert/strict";
import { validateClaimSourceClasses, type EvidenceClaim } from "../../../src/core/evidence/claim-graph.js";

test("required source classes downgrade unsupported legal holdings", () => {
  const claim = validateClaimSourceClasses({
    id: "bad-legal",
    text: "A blog held Article 21 was violated.",
    type: "legal_holding",
    requiredSourceClasses: [],
    supportingSourceIds: [9],
    confidence: "high",
    mustUseCarefulLanguage: false,
    forbiddenIfUnsupported: true,
    sourceClasses: ["indian_major_media"],
    supportScore: 80,
  } as EvidenceClaim);
  assert.equal(claim.confidence, "low");
  assert.ok((claim.supportScore ?? 0) <= 35);
  assert.equal(claim.mustUseCarefulLanguage, true);
});
