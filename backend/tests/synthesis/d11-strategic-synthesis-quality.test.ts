import { test } from "node:test";
import assert from "node:assert/strict";

import { buildStrategicInsightsDivision, validateD11StrategicInsights } from "../../src/core/synthesis/division-quality.ts";

const priorDivisions = new Map<string, string>([
  ["D1_core_brief", "Article 21 surveillance safeguards must connect legality, proportionality, and parliamentary oversight."],
  ["D7_debate_utility", "Treasury defends accountable legality while Opposition attacks overbreadth through POIs and amendments."],
]);

test("D11 without Diagnosis, Prescription, and Warning fails", () => {
  const result = validateD11StrategicInsights(
    "Strategic insight: delegates should use sources well and avoid unsupported claims.",
    priorDivisions,
  );

  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /Diagnosis/i.test(issue)));
  assert.ok(result.issues.some((issue) => /Prescription/i.test(issue)));
  assert.ok(result.issues.some((issue) => /Warning/i.test(issue)));
});

test("D11 that repeats D1 content fails", () => {
  const repeated = [
    "D11 Strategic Insights",
    "Diagnosis: Article 21 surveillance safeguards must connect legality, proportionality, and parliamentary oversight.",
    "Prescription: Article 21 surveillance safeguards must connect legality, proportionality, and parliamentary oversight.",
    "Warning: Article 21 surveillance safeguards must connect legality, proportionality, and parliamentary oversight.",
  ].join("\n");
  const result = validateD11StrategicInsights(repeated, priorDivisions);

  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /repeat/i.test(issue)));
});

test("D11 with real synthesis passes", () => {
  const output = buildStrategicInsightsDivision({
    agenda: "Article 21 surveillance safeguards",
    priorDivisions,
    sourceAnchors: ["[Source 1](https://example.com/source-1)", "[Source 2](https://example.com/source-2)"],
  });
  const result = validateD11StrategicInsights(output, priorDivisions);

  assert.equal(result.passed, true, result.issues.join("; "));
  assert.ok(result.metrics.repetitionRatio < 0.3);
});
