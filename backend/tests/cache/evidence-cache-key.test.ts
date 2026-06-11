import test from "node:test";
import assert from "node:assert/strict";
import { buildCacheKey } from "../../src/lib/evidence-cache.js";

test("evidence cache key preserves agenda word order through hashing", () => {
  const first = buildCacheKey("Should India ban coal?", "deep", "v1");
  const second = buildCacheKey("Should coal India ban?", "deep", "v1");

  assert.notEqual(first, second);
});
