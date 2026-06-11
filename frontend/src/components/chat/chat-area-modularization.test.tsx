import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripRawSourceJson, extractCitedSourceNums } from "./chat-metadata-utils";

test("chat area imports extracted modules for isolated responsibilities", async () => {
  const chatArea = await readFile(new URL("./chat-area.tsx", import.meta.url), "utf8");

  assert.match(chatArea, /from "\.\/chat-message-list"/);
  assert.match(chatArea, /from "\.\/chat-run-status"/);
  assert.match(chatArea, /from "\.\/use-chat-run-controller"/);
  assert.match(chatArea, /from "\.\/use-mode-model-selection"/);
  assert.match(chatArea, /from "\.\/chat-model-routing"/);
  assert.match(chatArea, /from "\.\/provider-model-display"/);
});

test("metadata helpers strip raw source JSON and preserve cited source extraction", () => {
  const content = "Answer [1] [Source 2]\n```json\n{\"sources\":[{\"url\":\"https://example.test\"}]}";

  assert.equal(stripRawSourceJson(content), "Answer [1] [Source 2]");
  assert.deepEqual([...extractCitedSourceNums("Answer [1] [Source 2] [not-a-source]")], [1, 2]);
});

test("stale stream guard remains scoped by run, assistant, and conversation identity", async () => {
  const runController = await readFile(new URL("./use-chat-run-controller.ts", import.meta.url), "utf8");
  const normalizer = await readFile(new URL("./stream-event-normalizer.ts", import.meta.url), "utf8");
  const guard = await readFile(new URL("./stale-event-guard.ts", import.meta.url), "utf8");

  assert.match(runController, /globalStreamRegistry/);
  assert.match(runController, /setActiveRun/);
  assert.match(normalizer, /isStaleRunScopedEvent/);
  assert.match(guard, /sameRun/);
  assert.match(guard, /sameAssistant/);
  assert.match(guard, /sameConversation/);
  assert.match(runController, /IGNORED_STALE_EVENT/);
});

test("stream completion accepts terminal success events without requiring content chunks", async () => {
  const runController = await readFile(new URL("./use-chat-run-controller.ts", import.meta.url), "utf8");
  const normalizer = await readFile(new URL("./stream-event-normalizer.ts", import.meta.url), "utf8");
  const terminalNormalizer = await readFile(new URL("../../lib/run-state/terminal-event-normalizer.ts", import.meta.url), "utf8");

  assert.match(runController, /successReceived/);
  assert.match(runController, /receivedDone/);
  assert.match(runController, /!response\.ok/);
  assert.match(normalizer, /normalizeTerminalEvent/);
  assert.match(terminalNormalizer, /isExplicitTerminalRunStatus/);
  assert.doesNotMatch(terminalNormalizer, /final_answer_ready/);
  assert.match(runController, /gotContent \|\| terminalState\.successReceived \|\| terminalState\.receivedDone/);
});

test("client-only normal streams merge completed assistant text into the conversation cache", async () => {
  const runController = await readFile(new URL("./use-chat-run-controller.ts", import.meta.url), "utf8");

  assert.match(runController, /mergeStreamedAssistantMessage/);
  assert.match(runController, /streamedAssistantText/);
  assert.match(runController, /serverAssistantMessageId == null/);
  assert.match(runController, /getGetAnthropicConversationQueryKey\(convId\)/);
});

test("stream controller cleanup is explicit and conversation scoped", async () => {
  const chatArea = await readFile(new URL("./chat-area.tsx", import.meta.url), "utf8");
  const runController = await readFile(new URL("./use-chat-run-controller.ts", import.meta.url), "utf8");

  assert.doesNotMatch(runController, /useEffect\(\(\) => abortAllStreams/);
  assert.match(runController, /return \(\) => abortAllStreams\(\)/);
  assert.match(runController, /abortStreamsForConversation/);
  assert.match(chatArea, /abortStreamsForConversation\(conversationId\)/);
  assert.doesNotMatch(chatArea, /return abortAllStreams/);
});
