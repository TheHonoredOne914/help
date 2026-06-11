import test from "node:test";
import assert from "node:assert/strict";
import {
  chiefVerdictComplete,
  councilCChunk,
  councilCComplete,
  councilCStarted,
  deliberationUpdate,
} from "../../src/core/council/council-stream-events.js";
import type { CouncilVerdict, CouncillorOutput } from "../../src/core/council/index.js";
import type { ResearchRunIdentity } from "../../src/core/pipeline/pipeline-events.js";

const identity: ResearchRunIdentity = {
  runId: "run-council-test",
  requestId: "request-council-test",
  conversationId: 1,
  assistantMessageId: 2,
  queryHash: "hash",
  researchMode: "council",
  createdAt: "2026-06-04T00:00:00.000Z",
};

const councillor: CouncillorOutput = {
  councillor_id: "C1_LEGAL",
  title: "Legal Councillor",
  perspective: "Legal framing",
  status: "complete",
  summary: "summary",
  raw_brief: "brief",
  key_claims: [],
  evidence_pack_ids: [],
  sources_used: [],
  started_at: "2026-06-04T00:00:00.000Z",
};

const verdict: CouncilVerdict = {
  strategic_position: "Use a measured constitutional line.",
  top_arguments: [],
  top_vulnerabilities: [],
  recommended_speech_strategy: "Lead with floor discipline.",
  opening_speech_variants: [],
  poi_bank: [],
  clash_matrix: { government_args: [], opposition_args: [], crossfire_points: [] },
};

test("Council stream event builders preserve envelope identity and event names", () => {
  assert.deepEqual(councilCStarted(identity, "C1_LEGAL", "Legal Councillor").eventType, "council_c_started");
  assert.deepEqual(councilCChunk(identity, "C1_LEGAL", "chunk").eventType, "council_c_chunk");
  assert.deepEqual(councilCComplete(identity, councillor).eventType, "council_c_complete");
  assert.deepEqual(deliberationUpdate(identity, [], [], 0).eventType, "deliberation_update");
  assert.deepEqual(chiefVerdictComplete(identity, verdict).eventType, "chief_verdict_complete");

  const complete = councilCComplete(identity, councillor);
  assert.equal(complete.runId, identity.runId);
  assert.equal(complete.requestId, identity.requestId);
  assert.equal(complete.researchMode, "council");
  assert.equal((complete.councillor as CouncillorOutput).councillor_id, "C1_LEGAL");
});
