import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("legacy research persistence uses terminal helpers instead of duplicate assistant inserts", () => {
  const service = fs.readFileSync(path.join(root, "backend/src/services/anthropic-service.ts"), "utf8");

  assert.match(service, /persistAssistantCompleted/);
  assert.match(service, /persistAssistantFailed/);
  assert.match(service, /maybeMergeArchive/);
  assert.doesNotMatch(
    service,
    /await db\.insert\(messagesTable\)\.values\(\{\s*conversationId,\s*role:\s*"assistant",\s*content:\s*(?:persistedContent|fallback|full)\s*\}\)/,
  );
});

test("exhausted research branches persist a terminal record before returning", () => {
  const service = fs.readFileSync(path.join(root, "backend/src/services/anthropic-service.ts"), "utf8");
  const exhaustedBranches = [...service.matchAll(/send\(\{\s*bothExhausted:\s*true\s*\}\);\s*return;/g)];

  assert.equal(exhaustedBranches.length, 0, "bothExhausted branches must not return without persistence");
  assert.match(service, /persistResearchExhausted/);
});

test("frontend ignores generic done events after a terminal failure event", () => {
  const runController = fs.readFileSync(path.join(root, "frontend/src/components/chat/use-chat-run-controller.ts"), "utf8");
  const normalizer = fs.readFileSync(path.join(root, "frontend/src/components/chat/stream-event-normalizer.ts"), "utf8");

  assert.match(runController, /failureReceived: false/);
  assert.match(runController, /normalized\.kind === "terminal" && !normalized\.failure && !terminalState\.failureReceived/);
  assert.match(runController, /data\.eventType === "failed" \|\| data\.eventType === "provider_error"[\s\S]*failureReceived: true/);
  assert.match(normalizer, /failureReceived: true/);
});
