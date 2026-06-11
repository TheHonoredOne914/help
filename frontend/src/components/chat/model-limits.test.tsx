import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("model limits hydrate persisted usage in the initial state initializer", async () => {
  const source = await readFile(new URL("./model-limits.tsx", import.meta.url), "utf8");

  assert.match(source, /useState<UsageState>\(\(\) => loadState\(\)\)/);
  assert.doesNotMatch(source, /useState<UsageState>\(emptyState\)/);
});
