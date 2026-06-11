import test from "node:test";
import assert from "node:assert/strict";
import { buildRoleSpecificInstructions } from "../../../src/core/synthesis/role-generation/role-specific-instructions.js";
import { getModeDepthStrategy } from "../../../src/core/synthesis/role-generation/mode-depth-strategy.js";

test("mode depth strategy makes fast and phd/full role prompts materially different", () => {
  assert.notEqual(getModeDepthStrategy("fast_research").instruction, getModeDepthStrategy("deep_research").instruction);
  assert.notEqual(
    buildRoleSpecificInstructions("thesis_synthesizer", "fast_research", {}),
    buildRoleSpecificInstructions("thesis_synthesizer", "council", {}),
  );
  assert.match(buildRoleSpecificInstructions("thesis_synthesizer", "deep_research", {}), /multi-sentence|contradictions|cross-source/i);
  assert.match(buildRoleSpecificInstructions("thesis_synthesizer", "fast_research", {}), /quick|few/i);
});
