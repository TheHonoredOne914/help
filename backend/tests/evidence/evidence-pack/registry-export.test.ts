import test from "node:test";
import assert from "node:assert/strict";
import { registryWith, testContract, testSource } from "./helpers.js";

test("B14-20 exportForPrompt skips or compacts entries instead of truncating mid-source", () => {
  const contract = testContract("large source export");
  const registry = registryWith([testSource({
    title: "Very large source",
    url: "https://example.org/source-1",
    keyFacts: ["A".repeat(500), "B".repeat(500), "C".repeat(500)],
    limitations: ["L".repeat(500)],
  })], contract);

  const exported = registry.exportForPrompt(180);

  assert.ok(exported.length <= 180);
  if (exported.length > 0) {
    assert.match(exported, /\[Source 1\]/);
    assert.match(exported, /URL:/);
    assert.match(exported, /Strength:/);
    assert.match(exported, /Facts:/);
    assert.match(exported, /Limitations:/);
  }
});
