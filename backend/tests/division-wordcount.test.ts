import { test } from "node:test";
import assert from "node:assert/strict";

import { validateDivision7, validateDivision11 } from "../src/services/division-engine.ts";

test("Division 7 validator requires POIs, rebuttals, coalition map, and red lines", () => {
  const incomplete = "Layer 7.4 - Federalism: What prevents misuse?\nNo coalition map.";

  const result = validateDivision7(incomplete);

  assert.equal(result.isComplete, false);
  assert.equal(result.hasPOIs, false);
  assert.equal(result.hasRebuttals, false);
  assert.equal(result.hasCoalitionMap, true);
  assert.equal(result.hasRedLines, false);
});

test("Division 7 validator accepts thesis-grade debate utility structure", () => {
  const pois = Array.from({ length: 15 }, (_, index) => `Layer 7.4 - Question ${index + 1}: What is the constitutional implication?`).join("\n");
  const rebuttals = Array.from({ length: 5 }, (_, index) => `When an opposing delegate argues position ${index + 1}, respond: cite the source-backed federalism limit.`).join("\n");
  const output = `${pois}\n${rebuttals}\nAlliance and coalition map with bloc positions.\nRed line: cannot accept executive dismissal without floor test.`;

  const result = validateDivision7(output);

  assert.equal(result.isComplete, true);
  assert.ok(result.poiCount >= 15);
  assert.ok(result.rebuttalCount >= 5);
});

test("Division 11 validator rejects repeated summary language from earlier divisions", () => {
  const prior = new Map([
    ["core_brief", "The governor's discretion must be constrained by floor-test evidence. This federalism claim is central."],
  ]);
  const repeated = "The governor's discretion must be constrained by floor-test evidence. This federalism claim is central. The governor's discretion must be constrained by floor-test evidence.";

  assert.equal(validateDivision11(repeated, prior), false);
});

test("Division 11 validator accepts new strategic synthesis", () => {
  const prior = new Map([
    ["core_brief", "The governor's discretion must be constrained by floor-test evidence. This federalism claim is central."],
  ]);
  const synthesis = "Strategically, delegates should convert the floor-test doctrine into a negotiation trigger that separates emergency governance from partisan dismissal. This matters because coalition actors can support narrow procedural safeguards without conceding their broader ideological position.";

  assert.equal(validateDivision11(synthesis, prior), true);
});
