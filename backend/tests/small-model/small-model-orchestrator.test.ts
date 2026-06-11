import test from "node:test";
import assert from "node:assert/strict";
import { runSmallModelTask, SMALL_MODEL_FORBIDDEN_TASKS } from "../../src/services/small-model-orchestrator.js";

const cards = Array.from({ length: 6 }, (_, index) => ({
  sourceId: index + 1,
  citation: `[Source ${index + 1}](https://example.com/${index + 1})`,
  title: `Source ${index + 1}`,
  url: `https://example.com/${index + 1}`,
  sourceClass: "policy_research" as const,
  bucketIds: ["policy_research" as const],
  date: null,
  relevanceScore: 80,
  keyFacts: [`fact ${index + 1}`],
  keyNumbers: [],
  legalHoldings: [],
  governmentPosition: null,
  civilLibertiesPosition: null,
  electoralIntegrityPosition: null,
  debateUse: `use ${index + 1}`,
  limitations: [],
  usableSections: ["policy_research"],
}));

test("small-model worker processes narrow JSON tasks over evidence cards only", async () => {
  const result = await runSmallModelTask({
    taskId: "classify-1",
    taskType: "source_classification",
    evidenceCards: cards,
    requiredSourceIds: [1, 2, 3, 4, 5, 6],
    outputSchema: { type: "array" },
    maxRetries: 1,
  }, async ({ evidenceCards }) => JSON.stringify(evidenceCards.map((card) => ({ sourceId: card.sourceId, label: "relevant" }))));

  assert.equal(result.validJson, true);
  assert.equal(result.sourceCountProcessed, 6);
  assert.deepEqual(result.sourceIdsProcessed, [1, 2, 3, 4, 5, 6]);
  assert.equal(result.needsEscalation, false);
});

test("small-model worker escalates invalid JSON and forbidden final-judgment tasks", async () => {
  assert.ok(SMALL_MODEL_FORBIDDEN_TASKS.includes("final_thesis_synthesis"));

  const result = await runSmallModelTask({
    taskId: "bad-json",
    taskType: "claim_labeling",
    evidenceCards: cards.slice(0, 2),
    requiredSourceIds: [1, 2],
    outputSchema: { type: "array" },
    maxRetries: 1,
  }, async () => "not json");

  assert.equal(result.validJson, false);
  assert.equal(result.needsEscalation, true);
});
