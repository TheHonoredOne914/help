import assert from "node:assert/strict";
import test from "node:test";
import { collectRetrievalCacheStats } from "./useRetrievalCacheStats";

test("collectRetrievalCacheStats folds cache events by layer", () => {
  const stats = collectRetrievalCacheStats([
    { type: "retrieval_cache_hit", timestamp: 1, data: { layer: "search_result" } },
    { type: "retrieval_cache_miss", timestamp: 2, data: { layer: "search_result" } },
    { type: "retrieval_cache_negative_hit", timestamp: 3, data: { layer: "url_extraction" } },
    { type: "provider_cooldown_active", timestamp: 4, data: { provider: "jina", cooldownUntil: "2026-06-05T10:30:00.000Z" } },
    { type: "retrieval_cache_schema_mismatch", timestamp: 5, data: { layer: "evidence_ready" } },
  ]);

  const search = stats.summaries.find((summary) => summary.layer === "search_result");
  const extraction = stats.summaries.find((summary) => summary.layer === "url_extraction");
  assert.equal(search?.hits, 1);
  assert.equal(search?.misses, 1);
  assert.equal(extraction?.negativeHits, 1);
  assert.deepEqual(stats.cooldowns, ["jina until 10:30"]);
  assert.deepEqual(stats.warnings, ["retrieval cache schema mismatch"]);
});
