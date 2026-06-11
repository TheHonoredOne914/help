import { test } from "node:test";
import assert from "node:assert/strict";

import { validateDivision11 } from "../src/services/division-engine.ts";

test("Division 11 does not repeat Division 1-10 content", () => {
  const priorOutputs = new Map<string, string>([
    ["core_brief", "Article 356 is valid only when constitutional machinery has failed and floor-test alternatives are unavailable."],
    ["debate_utility", "Delegates should ask whether the governor exhausted objective legislative remedies before recommending President's Rule."],
  ]);
  const d11 = [
    "The strategic leverage lies in reframing Article 356 as a procedural-negotiation question rather than a binary Union-versus-State fight.",
    "A delegate can build consensus by demanding transparent governor reports, time-bound floor tests, and parliamentary disclosure before emergency approval.",
    "This introduces new committee utility because opposition and treasury delegates can both accept a verification standard while disagreeing on specific dismissals.",
  ].join(" ");

  assert.equal(validateDivision11(d11, priorOutputs), true);
});
