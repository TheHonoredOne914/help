import test from "node:test";
import assert from "node:assert/strict";
import { findCouncilSeals } from "../../src/core/council/deliberation-engine.js";
import type { ClaimObject, CouncillorOutput, RetrievingCouncillorId } from "../../src/core/council/index.js";

const ids: RetrievingCouncillorId[] = ["C1_LEGAL", "C2_ECONOMIC", "C3_STRATEGIC", "C4_SOCIAL", "C5_HISTORICAL", "C6_OPPOSITION"];

function claim(id: RetrievingCouncillorId, index: number, stance: ClaimObject["stance"]): ClaimObject {
  return {
    claim_id: `${id}-claim-${index}`,
    text: "GST federalism needs cooperative constitutional safeguards",
    source_ids: [`${id}-S1`],
    councillor_id: id,
    confidence: index === 0 ? "high" : "medium",
    stance,
    tags: ["gst", "federalism", "constitutional"],
  };
}

function output(id: RetrievingCouncillorId, index: number, stance: ClaimObject["stance"]): CouncillorOutput {
  return {
    councillor_id: id,
    title: id,
    perspective: "test",
    status: "complete",
    summary: "brief",
    raw_brief: "brief",
    key_claims: [claim(id, index, stance)],
    evidence_pack_ids: [],
    sources_used: [`${id}-S1`],
    started_at: "2026-06-04T00:00:00.000Z",
  };
}

test("findCouncilSeals creates a seal for three or more distinct councillor supports", () => {
  const result = findCouncilSeals([
    output(ids[0], 0, "supports"),
    output(ids[1], 1, "supports"),
    output(ids[2], 2, "supports"),
    output(ids[3], 3, "challenges"),
  ]);

  assert.equal(result.seals.length, 1);
  assert.equal(result.seals[0].level, "probable");
  assert.deepEqual(result.seals[0].endorsing_councillors, ["C1_LEGAL", "C2_ECONOMIC", "C3_STRATEGIC"]);
  assert.ok(result.disputes.some((dispute) => dispute.conflict_type === "direct_contradiction"));
});

test("findCouncilSeals returns empty consensus instead of throwing on no claims", () => {
  const result = findCouncilSeals([]);

  assert.deepEqual(result.seals, []);
  assert.deepEqual(result.disputes, []);
  assert.equal(result.agreementScore, 0);
});
