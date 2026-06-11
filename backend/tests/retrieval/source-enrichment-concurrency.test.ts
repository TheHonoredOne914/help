import test from "node:test";
import assert from "node:assert/strict";
import { enrichSourcesConcurrent } from "../../src/core/retrieval/source-enrichment.js";

test("source enrichment respects configured concurrency", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchFn = (async () => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 10));
    inFlight -= 1;
    return new Response("<html><body>Full readable source text for a citation eligible document.</body></html>", { status: 200 });
  }) as typeof fetch;

  await enrichSourcesConcurrent(Array.from({ length: 8 }, (_, index) => ({
    title: `Source ${index}`,
    url: `https://example.com/${index}`,
    domain: "example.com",
    snippet: "snippet",
  })), { fetchFn }, 3);

  assert.ok(maxInFlight <= 3);
});

test("source enrichment blocks direct fetches to internal and private URLs before fetch", async () => {
  const blockedUrls = [
    "http://localhost:22",
    "http://127.0.0.1/admin",
    "http://10.0.0.5/internal",
    "http://172.16.0.1/internal",
    "http://192.168.1.7/internal",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/internal",
    "file:///etc/passwd",
  ];
  let fetchCalls = 0;
  const fetchFn = (async () => {
    fetchCalls += 1;
    return new Response("should not fetch", { status: 200 });
  }) as typeof fetch;

  const enriched = await enrichSourcesConcurrent(blockedUrls.map((url, index) => ({
    title: `Unsafe ${index}`,
    url,
    domain: "unsafe.local",
    snippet: "safe fallback snippet",
  })), { fetchFn }, 4);

  assert.equal(fetchCalls, 0);
  assert.equal(enriched.length, blockedUrls.length);
  assert.ok(enriched.every((source) => source.extractionMethod === "snippet_fallback"));
  assert.ok(enriched.every((source) => /unsafe source url/i.test(source.enrichmentError ?? "")));
});

test("source enrichment blocks unsafe Jina reader URLs before fetch", async () => {
  let fetchCalls = 0;
  const fetchFn = (async () => {
    fetchCalls += 1;
    return new Response("should not fetch", { status: 200 });
  }) as typeof fetch;

  const [enriched] = await enrichSourcesConcurrent([{
    title: "Metadata service",
    url: "http://169.254.169.254/latest/meta-data/",
    domain: "169.254.169.254",
    snippet: "metadata fallback snippet",
  }], {
    jinaKey: "jina-test-key",
    fetchFn,
  }, 1);

  assert.equal(fetchCalls, 0);
  assert.equal(enriched.extractionMethod, "snippet_fallback");
  assert.equal(enriched.extractionProvider, "snippet_fallback");
  assert.match(enriched.enrichmentError ?? "", /unsafe source url/i);
});
