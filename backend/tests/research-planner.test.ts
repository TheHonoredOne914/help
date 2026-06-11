import test from "node:test";
import assert from "node:assert/strict";

import { ensureResearchWorkerModels } from "../src/routes/anthropic.ts";

test("web search adds a fallback worker when only the planner model is selected", () => {
  const models = ensureResearchWorkerModels("web_search", ["groq/custom-planner"], "groq/default-worker");

  assert.deepEqual(models, ["groq/custom-planner", "groq/default-worker"]);
});

test("deep research adds a fallback worker when only the planner model is selected", () => {
  const models = ensureResearchWorkerModels("deep_research", ["groq/custom-planner"], "groq/default-worker");

  assert.deepEqual(models, ["groq/custom-planner", "groq/default-worker"]);
});

test("research model selection keeps existing planner and workers unchanged", () => {
  const models = ensureResearchWorkerModels(
    "deep_research",
    ["groq/planner", "gemini/worker"],
    "groq/default-worker",
  );

  assert.deepEqual(models, ["groq/planner", "gemini/worker"]);
});

test("normal mode does not add research workers", () => {
  const models = ensureResearchWorkerModels("normal", ["groq/solo"], "groq/default-worker");

  assert.deepEqual(models, ["groq/solo"]);
});
