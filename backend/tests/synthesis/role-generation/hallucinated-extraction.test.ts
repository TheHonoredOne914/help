import test from "node:test";
import assert from "node:assert/strict";
import { validateRoleOutput } from "../../../src/core/synthesis/role-generation/role-output-validator.js";
import { makeCard, makeRegistry, testAgenda } from "./helpers.js";

test("hallucinated role extraction is rejected by validator-backed role output validation", () => {
  const cards = [makeCard(1, { keyFacts: ["The source says only fact X about public order safeguards."] })];
  const report = validateRoleOutput({
    roleName: "evidence_extractor",
    items: [{
      sourceId: 1,
      title: cards[0].title,
      bucketIds: cards[0].bucketIds,
      sourceClass: cards[0].sourceClass,
      usageType: "fact_extracted",
      extractedClaim: "Fabricated unrelated fact Y about a budget number.",
      confidence: "high",
    }],
    evidenceRegistry: makeRegistry(cards),
    agendaContract: testAgenda(),
    requiredCount: 1,
    allowedSourceIds: [1],
  });

  assert.equal(report.passed, false);
  assert.match(report.failures.join("\n"), /ungrounded|not grounded|fewer/i);
});
