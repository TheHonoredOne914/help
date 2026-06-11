import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDivisionOutputs } from "../division-output-normalizer";

test("frontend restores persisted division outputs from metadata", () => {
  assert.deepEqual(normalizeDivisionOutputs({ D1: "  one  ", D2: "", D3: 42 }), { D1: "one" });
});
