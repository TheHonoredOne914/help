import test from "node:test";
import assert from "node:assert/strict";
import { buildRoleBatchPrompt } from "../../../src/core/synthesis/role-generation/role-batch-prompt.js";
import { makeCard } from "./helpers.js";

test("role batch prompt serializes multiple chunks and source quality fields", () => {
  const prompt = buildRoleBatchPrompt([makeCard(1)], { roleName: "evidence_extractor", maxCharsPerChunk: 140 });

  assert.match(prompt, /TopChunks:\n\[1\]/);
  assert.match(prompt, /\[2\] Second chunk for source 1 contains the decisive extractor fact/);
  assert.match(prompt, /\[3\] Third chunk for source 1 adds cross-source nuance/);
  assert.match(prompt, /citationStrength: strong/);
  assert.match(prompt, /limitedSource: false/);
  assert.match(prompt, /extractionQuality: full/);
  assert.match(prompt, /namedEntities: Lok Sabha; Supreme Court; Entity 1/);
});
