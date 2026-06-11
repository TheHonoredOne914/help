import test from "node:test";
import assert from "node:assert/strict";
import { COUNCIL_LIMITS, COUNCIL_TIMEOUT_MS, COUNCILLOR_ROLES, RETRIEVING_COUNCILLOR_IDS, roleForCouncillor } from "../../src/core/council/index.js";

test("Council config defines six retrieving councillors and one non-retrieving chief", () => {
  assert.equal(RETRIEVING_COUNCILLOR_IDS.length, 6);
  assert.equal(COUNCILLOR_ROLES.length, 7);
  assert.equal(COUNCILLOR_ROLES.find((role) => role.id === "C7_CHIEF")?.retrievesEvidence, false);
  assert.ok(RETRIEVING_COUNCILLOR_IDS.every((id) => roleForCouncillor(id).retrievesEvidence));
});

test("Council limits keep mode-specific budgets isolated", () => {
  assert.equal(COUNCIL_TIMEOUT_MS, 30 * 60 * 1000);
  assert.equal(COUNCIL_LIMITS.minSourcesForSession, 90);
  assert.equal(COUNCIL_LIMITS.minCompletedCouncillors, 5);
  assert.equal(COUNCIL_LIMITS.maxRawSourcesPerCouncillor, 50);
  assert.equal(COUNCIL_LIMITS.maxCardsPerPack, 16);
  assert.equal(COUNCIL_LIMITS.maxCardsInCouncillorPrompt, 288);
  assert.equal(COUNCIL_LIMITS.enrichmentBudgetMs, 480_000);
  assert.equal(COUNCIL_LIMITS.minClaimsPerCouncillor, 3);
  assert.ok(COUNCIL_LIMITS.maxCardsPerPack < 28);
});
