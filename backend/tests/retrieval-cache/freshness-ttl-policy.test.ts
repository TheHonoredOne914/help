import assert from "node:assert/strict";
import test from "node:test";
import {
  emptySearchNegativeTtlMs,
  freshnessForExtractionUrl,
  freshnessForSearchResults,
  ttlForFreshness,
} from "../../src/core/retrieval-cache/retrieval-cache-policy.js";

test("extraction: gov/legal static; news article semi_static; listing fresh", () => {
  assert.equal(freshnessForExtractionUrl("https://indiankanoon.org/doc/123/"), "static");
  assert.equal(freshnessForExtractionUrl("https://pib.gov.in/PressRelease.aspx?id=1"), "static");
  assert.equal(freshnessForExtractionUrl("https://egazette.nic.in/files/act.pdf"), "static");
  assert.equal(freshnessForExtractionUrl("https://www.thehindu.com/news/national/privacy-bill-2026/article123.ece"), "semi_static");
  assert.equal(freshnessForExtractionUrl("https://indianexpress.com/article/india/sc-ruling-2026/"), "semi_static");
  assert.equal(freshnessForExtractionUrl("https://www.thehindu.com/latest/"), "fresh");
  assert.equal(freshnessForExtractionUrl("https://www.ndtv.com/topic/election"), "fresh");
});

test("search: news fresh; legal/official semi_static; disagree with article URL class", () => {
  assert.equal(freshnessForSearchResults("news"), "fresh");
  assert.equal(freshnessForSearchResults("legal"), "semi_static");
  assert.equal(freshnessForSearchResults("official"), "semi_static");
  assert.equal(freshnessForSearchResults("academic"), "semi_static");
  // news query TTL ≠ news article extraction TTL
  assert.equal(freshnessForSearchResults("news"), "fresh");
  assert.equal(freshnessForExtractionUrl("https://www.thehindu.com/news/national/foo/article1.ece"), "semi_static");
  assert.notEqual(freshnessForSearchResults("news"), freshnessForExtractionUrl("https://www.thehindu.com/news/national/foo/article1.ece"));
});

test("TTL helpers: empty negatives short; semi_static at least ~7d", () => {
  assert.ok(emptySearchNegativeTtlMs() >= 30 * 60 * 1000 && emptySearchNegativeTtlMs() <= 60 * 60 * 1000);
  assert.ok(ttlForFreshness("semi_static") >= 7 * 24 * 60 * 60 * 1000);
  assert.ok(ttlForFreshness("fresh") >= 6 * 60 * 60 * 1000);
  assert.ok(ttlForFreshness("fresh") <= 12 * 60 * 60 * 1000);
});
