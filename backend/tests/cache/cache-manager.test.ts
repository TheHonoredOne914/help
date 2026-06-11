import test from "node:test";
import assert from "node:assert/strict";
import { CacheManager } from "../../src/services/cache-manager.js";

test("cache reuses unexpired entries and ignores expired entries", () => {
  const cache = new CacheManager({ now: () => 1_000 });
  cache.set("search", "query", { ok: true }, { ttlMs: 100 });
  assert.deepEqual(cache.get("search", "query"), { ok: true });

  cache.setNow(() => 1_101);
  assert.equal(cache.get("search", "query"), null);
});

test("cache redacts secrets before storing provider-shaped errors", () => {
  const cache = new CacheManager({ now: () => 1_000 });
  cache.set("quality", "err", { message: "Bearer sk-or-v1-secret and GROQ_API_KEY=gsk_secret" }, { ttlMs: 1000 });

  assert.doesNotMatch(JSON.stringify(cache.get("quality", "err")), /sk-or-v1-secret|gsk_secret/);
  assert.match(JSON.stringify(cache.get("quality", "err")), /REDACTED/);
});

test("fresh query TTL is shorter than static legal source TTL", () => {
  const cache = new CacheManager({ now: () => 1_000 });

  assert.ok(cache.ttlForFreshness("fresh") < cache.ttlForFreshness("static"));
  assert.ok(cache.ttlForFreshness("semi_static") < cache.ttlForFreshness("static"));
});

test("cache evicts oldest entries when max size is reached", () => {
  const cache = new CacheManager({ now: () => 1_000, maxEntries: 2 });
  cache.set("search", "a", "A");
  cache.set("search", "b", "B");
  cache.set("search", "c", "C");

  assert.equal(cache.stats().entries, 2);
  assert.equal(cache.get("search", "a"), null);
  assert.equal(cache.get("search", "b"), "B");
  assert.equal(cache.get("search", "c"), "C");
});
