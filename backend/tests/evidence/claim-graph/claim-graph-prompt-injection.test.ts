import test from "node:test";
import assert from "node:assert/strict";
import { formatClaimGraphForPrompt } from "../../../src/core/evidence/claim-graph.js";
import { buildCoreAnswerUserPrompt } from "../../../src/core/generation/core-answer-prompt.js";
import { buildValidatedGraph } from "./helpers.js";

test("ClaimGraph formats compact synthesis prompt block", () => {
  const { claimGraph } = buildValidatedGraph();
  const block = formatClaimGraphForPrompt(claimGraph, 8);
  assert.match(block, /Strongest supported claims:/);
  assert.match(block, /Counterclaims:/);
  assert.match(block, /Forbidden if unsupported:/);
});

test("final synthesis prompt includes ClaimGraph beside ClaimLedger", () => {
  const run = buildValidatedGraph();
  const prompt = buildCoreAnswerUserPrompt({
    requestId: "prompt-test",
    userQuery: run.agendaContract.originalUserQuery,
    mode: "deep_research",
    agendaContract: run.agendaContract,
    evidenceRegistry: run.evidenceRegistry,
    evidencePacks: run.evidencePacks,
    claimGraph: run.claimGraph,
    sourceUsageMaps: run.modelRoleOutputs,
  });
  assert.equal(typeof prompt, "string");
  assert.match(prompt as string, /ClaimGraph:/);
  assert.match(prompt as string, /support|score|sources/i);
});
