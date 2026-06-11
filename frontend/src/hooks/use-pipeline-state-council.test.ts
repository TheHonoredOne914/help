import test from "node:test";
import assert from "node:assert/strict";
import { initialPipelineState, pipelineReducer } from "./use-pipeline-state";

test("pipelineReducer stores Council events in the active run only", () => {
  let state = pipelineReducer(initialPipelineState, {
    type: "SET_ACTIVE_RUN",
    runId: "run-council",
    assistantMessageId: "assistant-1",
    conversationId: 1,
  });
  state = pipelineReducer(state, { type: "SELECTED_RESEARCH_MODE", mode: "council" });
  state = pipelineReducer(state, { type: "COUNCIL_C_STARTED", councillorId: "C1_LEGAL", title: "Legal Councillor" });
  state = pipelineReducer(state, { type: "COUNCIL_C_CHUNK", councillorId: "C1_LEGAL", chunk: "First legal chunk. " });
  state = pipelineReducer(state, {
    type: "COUNCIL_C_COMPLETE",
    councillor: {
      councillor_id: "C1_LEGAL",
      title: "Legal Councillor",
      perspective: "Constitutional and statutory risk",
      status: "complete",
      summary: "Final legal text.",
      raw_brief: "Final legal text.",
      key_claims: [{ claim_id: "c1", text: "Federalism claim", source_ids: ["C1_LEGAL-S1"], councillor_id: "C1_LEGAL", confidence: "high", stance: "supports", tags: ["federalism"] }],
      sources_used: ["C1_LEGAL-S1"],
      evidence_pack_ids: [],
      started_at: "2026-06-04T00:00:00.000Z",
    },
  });
  state = pipelineReducer(state, {
    type: "DELIBERATION_UPDATE",
    seals: [],
    disputes: [],
    agreementScore: 70,
  });
  state = pipelineReducer(state, {
    type: "CHIEF_VERDICT_COMPLETE",
    verdict: null,
  });

  const session = state.runs["run-council"].councilSession;
  assert.equal(state.selectedResearchMode, "council");
  assert.equal(session?.councillors.C1_LEGAL?.raw_brief, "Final legal text.");
  assert.equal(session?.agreement_score, 70);
  assert.equal(session?.status, "complete");
  assert.equal(state.councilSession, session);
});
