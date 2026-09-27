import test from "node:test";
import assert from "node:assert/strict";

import {
  USER_SYSTEM_PROMPT_MAX_CHARS,
  capUserSystemPrompt,
  resolveRouteMode,
} from "../../src/services/anthropic/message-route-mode.ts";

test("drafting and rhetorics stay on the mode the client sent", () => {
  assert.equal(resolveRouteMode("normal"), "normal");
  assert.equal(resolveRouteMode("drafting"), "drafting");
  assert.equal(resolveRouteMode("rhetorics"), "rhetorics");
  assert.equal(resolveRouteMode("fast_research"), "fast_research");
  assert.equal(resolveRouteMode("deep_research"), "deep_research");
  assert.equal(resolveRouteMode("council"), "council");
});

test("web_search is the public name for fast research", () => {
  assert.equal(resolveRouteMode("web_search"), "fast_research");
});

test("custom system prompt is capped at 4000 characters", () => {
  assert.equal(capUserSystemPrompt("keep this"), "keep this");
  const oversized = "a".repeat(USER_SYSTEM_PROMPT_MAX_CHARS + 25);
  const capped = capUserSystemPrompt(oversized);
  assert.equal(capped.length, USER_SYSTEM_PROMPT_MAX_CHARS);
  assert.equal(capped, oversized.slice(0, USER_SYSTEM_PROMPT_MAX_CHARS));
});
