import test from "node:test";
import assert from "node:assert/strict";
import { buildRolePrompt } from "../../../src/core/synthesis/role-generation/role-prompt-builder.js";
import { makeCard } from "./helpers.js";

test("role prompt tells auditors how to treat weak, snippet, and limited sources", () => {
  const prompt = buildRolePrompt({
    roleName: "citation_auditor",
    researchMode: "deep_research",
    cards: [makeCard(1, { citationStrength: "weak", limitedSource: true, extractionQuality: "snippet" })],
    claimGraphContext: "",
    sourceGapContext: "",
    stricter: false,
  });

  assert.match(prompt.system, /weak\/snippet\/limited sources should usually be relevant_but_weak/i);
  assert.match(prompt.user, /citationStrength: weak/);
  assert.match(prompt.user, /limitedSource: true/);
  assert.match(prompt.user, /extractionQuality: snippet/);
});
