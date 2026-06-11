import test from "node:test";
import assert from "node:assert/strict";
import { buildRoleRetryPrompt } from "../../../src/core/synthesis/role-generation/role-retry-planner.js";

test("retry planner includes failed source ids, reasons, and role-specific guidance", () => {
  const prompt = buildRoleRetryPrompt({
    roleName: "citation_auditor",
    researchMode: "deep_research",
    failedSourceIds: [2, 5],
    failures: ["Source 2 listed without extraction", "Source 5 was out of batch"],
    previousPromptFingerprint: "abc",
  });

  assert.match(prompt, /2, 5/);
  assert.match(prompt, /listed without extraction/);
  assert.match(prompt, /out of batch/);
  assert.match(prompt, /citation safety|source strength/i);
  assert.match(prompt, /Do not repeat the previous prompt/i);
});
