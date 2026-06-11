import assert from "node:assert/strict";
import { missingRunEnvelopeFields, shouldAcceptRunScopedEvent } from "../src/core/streaming/run-event-scope.js";

const promptA = {
  runId: "run_A",
  requestId: "req_A",
  conversationId: 1,
  userMessageId: 11,
  assistantMessageId: 101,
  queryHash: "hash_A",
  researchMode: "council" as const,
  eventType: "answer_delta",
  content: "declining democratic space",
};

const promptB = {
  runId: "run_B",
  requestId: "req_B",
  conversationId: 1,
  userMessageId: 12,
  assistantMessageId: 102,
  queryHash: "hash_B",
  researchMode: "council" as const,
  eventType: "answer_delta",
  content: "Election Commission of India",
};

const active = {
  runId: promptB.runId,
  assistantMessageId: promptB.assistantMessageId,
  conversationId: promptB.conversationId,
};

let ignoredStaleEventsCount = 0;
let promptBAnswer = "";
for (const event of [promptA, promptB]) {
  assert.deepEqual(missingRunEnvelopeFields(event), []);
  if (shouldAcceptRunScopedEvent(event, active)) {
    promptBAnswer += event.content;
  } else {
    ignoredStaleEventsCount += 1;
  }
}

const promptBMetadata = {
  runId: promptB.runId,
  requestId: promptB.requestId,
  conversationId: promptB.conversationId,
  assistantMessageId: promptB.assistantMessageId,
  queryHash: promptB.queryHash,
  researchMode: promptB.researchMode,
};

assert.notEqual(promptA.runId, promptB.runId);
assert.equal(ignoredStaleEventsCount, 1);
assert.doesNotMatch(promptBAnswer, /declining democratic space/i);
assert.match(promptBAnswer, /Election Commission of India/i);
assert.equal(promptBMetadata.assistantMessageId, active.assistantMessageId);

console.log(JSON.stringify({
  ok: true,
  promptARunId: promptA.runId,
  promptBRunId: promptB.runId,
  promptBAssistantMessageId: promptB.assistantMessageId,
  ignoredStaleEventsCount,
  promptBContainsPromptAFingerprint: /declining democratic space/i.test(promptBAnswer),
  metadataScopedToPromptB: promptBMetadata.runId === active.runId && promptBMetadata.assistantMessageId === active.assistantMessageId,
}, null, 2));
