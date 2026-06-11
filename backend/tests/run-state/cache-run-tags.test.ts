import test from "node:test";
import assert from "node:assert/strict";
import { CacheManager } from "../../src/services/cache-manager.js";

test("cache does not reuse failed or partial entries as successful results", () => {
  const cache = new CacheManager({ now: () => 1_000 });
  cache.set("search", "failed", ["bad"], { runTags: { runId: "r1", status: "failed" } });
  cache.set("search", "partial", ["partial"], { runTags: { runId: "r2", status: "completed_with_source_gaps" } });
  cache.set("search", "ok", ["ok"], { runTags: { runId: "r3", status: "completed" } });

  assert.equal(cache.get("search", "failed"), null);
  assert.equal(cache.get("search", "partial"), null);
  assert.deepEqual(cache.get("search", "partial", { allowPartialReuse: true }), ["partial"]);
  assert.deepEqual(cache.get("search", "ok"), ["ok"]);
});
