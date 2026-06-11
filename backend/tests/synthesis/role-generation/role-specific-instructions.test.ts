import test from "node:test";
import assert from "node:assert/strict";
import { buildRoleSpecificInstructions } from "../../../src/core/synthesis/role-generation/role-specific-instructions.js";

test("all Brick 17 roles receive materially different instruction blocks", () => {
  const roles = [
    "retrieval_critic",
    "evidence_extractor",
    "thesis_synthesizer",
    "citation_auditor",
    "indian_parliamentary_strategist",
    "final_quality_auditor",
    "legal_analyst",
    "data_analyst",
  ];
  const instructions = roles.map((roleName) => buildRoleSpecificInstructions(roleName, "deep_research", { supportedSection: "evidence_verification" }));

  assert.equal(new Set(instructions).size, roles.length);
  assert.match(instructions[0], /missing buckets|limited\/snippet|source gaps/i);
  assert.match(instructions[1], /precise facts|numbers|legal holdings/i);
  assert.match(instructions[2], /claim spine|central contradiction/i);
  assert.match(instructions[3], /citation safety|unsupported claims/i);
  assert.match(instructions[4], /Treasury Bench|Opposition|POIs|rebuttals/i);
  assert.match(instructions[5], /audit role outputs|final-use risks/i);
  assert.match(instructions[6], /constitutional provisions|Supreme Court|High Court|ECI/i);
  assert.match(instructions[7], /statistics|rankings|methodology|numeric contradictions/i);
});
