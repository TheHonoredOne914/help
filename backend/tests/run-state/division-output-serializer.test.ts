import test from "node:test";
import assert from "node:assert/strict";
import { serializeDivisionOutputs, restoreDivisionOutputs } from "../../src/core/run-state/division-output-serializer.js";

test("serializes divisionOutputs Map into a JSON-safe object and restores it", () => {
  const outputs = new Map<string, string>([
    ["D1", "Treasury Bench framing"],
    ["D11_final", "Opposition rebuttal strategy"],
  ]);

  const serialized = serializeDivisionOutputs(outputs);

  assert.deepEqual(serialized, {
    D1: "Treasury Bench framing",
    D11_final: "Opposition rebuttal strategy",
  });
  assert.deepEqual([...restoreDivisionOutputs(serialized)], [...outputs]);
});

test("drops blank and non-string division outputs instead of persisting unusable data", () => {
  const serialized = serializeDivisionOutputs(new Map<any, any>([
    ["D1", "  "],
    ["D2", "usable"],
    ["D3", 42],
  ]));

  assert.deepEqual(serialized, { D2: "usable" });
});
