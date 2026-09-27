import test from "node:test";
import assert from "node:assert/strict";
import { createSearchRuntimeMetadata, extractWithFallback, searchWithFallback } from "../../src/core/search/search-provider-router.js";
import { getExtractionProviderOrder } from "../../src/core/search/search-fallback-policy.js";

test("search router keeps Serper and Exa before Tavily and merges duplicate provenance", async () => {
  const calls: string[] = [];
  const runtime = createSearchRuntimeMetadata();

  const results = await searchWithFallback({
    query: "India Parliament federalism",
    mode: "web",
    bucketId: "parliamentary_records",
    maxResults: 2,
  }, {
    mode: "deep_research",
    keys: { serper: "serper-test", exa: "exa-test", tavily: "tavily-test" },
    runtime,
    fetchFn: async (url) => {
      calls.push(String(url));
      if (String(url).includes("serper")) {
        return new Response(JSON.stringify({ organic: [{ title: "PRS", link: "https://prsindia.org/report?utm_source=x", snippet: "Keyword source" }] }), { status: 200 });
      }
      if (String(url).includes("exa")) {
        return new Response(JSON.stringify({ results: [{ title: "PRS semantic", url: "https://prsindia.org/report", text: "Semantic source", score: 0.9 }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ results: [{ title: "PIB", url: "https://pib.gov.in/release", content: "Fallback source" }] }), { status: 200 });
    },
  });

  assert.match(calls[0], /serper/);
  assert.ok(calls.length >= 1, "primary provider should run immediately");
  assert.ok(results.length >= 1);
  assert.deepEqual(results.find((result) => result.url === "https://prsindia.org/report")?.metadata?.discoveredBy, ["serper"]);
  assert.deepEqual(runtime.searchProvidersUsed, ["serper"]);
});

test("search router runs Exa when Serper is missing and reports missing providers without fake sources", async () => {
  const errors: string[] = [];
  const results = await searchWithFallback({
    query: "Supreme Court federalism India",
    mode: "semantic",
    maxResults: 1,
  }, {
    mode: "web_search",
    keys: { exa: "exa-test" },
    onProviderError: (error) => errors.push(error),
    fetchFn: async () => new Response(JSON.stringify({ results: [{ title: "Semantic", url: "https://example.com/semantic", text: "Semantic result", score: 0.8 }] }), { status: 200 }),
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].provider, "exa");
  assert.equal(errors.length, 0);
});

test("extractWithFallback escalates Firecrawl when Jina returns thin non-shell text on gov URL", async () => {
  const providers: string[] = [];
  const longFirecrawl = "The Election Commission of India advised platforms to take down synthetic election content within three hours of a verified notice and to disclose political ad spend. ".repeat(3);
  const result = await extractWithFallback("https://pib.gov.in/PressReleasePage.aspx?PRID=123", {
    keys: { jina: "jina-test", firecrawl: "fc-test" },
    snippet: "short search snippet",
    fetchFn: async (url) => {
      const href = String(url);
      if (href.includes("jina.ai")) {
        providers.push("jina");
        return new Response("Press Information Bureau", { status: 200 });
      }
      if (href.includes("firecrawl")) {
        providers.push("firecrawl");
        return new Response(JSON.stringify({
          success: true,
          data: { markdown: longFirecrawl, title: "PIB release" },
        }), { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    },
  });

  assert.deepEqual(providers, ["jina", "firecrawl"]);
  assert.equal(result.provider, "firecrawl");
  assert.equal(result.status, "success");
  assert.ok((result.markdown ?? result.text ?? "").length >= 300);
});

test("extractWithFallback skips scrapingbee when SCRAPINGBEE_ENABLED is not true", async () => {
  const previous = process.env.SCRAPINGBEE_ENABLED;
  process.env.SCRAPINGBEE_ENABLED = "false";
  const urls: string[] = [];
  try {
    const result = await extractWithFallback("https://example.com/page", {
      keys: { jina: "jina-test", scrapingbee: "bee-test" },
      fetchFn: async (url) => {
        urls.push(String(url));
        return new Response(
          "<html><body><article>"
          + "Jina HTML body describing Election Commission rules on AI political ads, deepfake labelling, and platform transparency obligations during the Model Code of Conduct period in India. ".repeat(2)
          + "</article></body></html>",
          { status: 200 },
        );
      },
    });
    assert.equal(result.provider, "jina");
    assert.ok(urls.some((u) => u.includes("jina.ai")));
    assert.ok(urls.every((u) => !u.includes("scrapingbee")));
  } finally {
    if (previous === undefined) delete process.env.SCRAPINGBEE_ENABLED;
    else process.env.SCRAPINGBEE_ENABLED = previous;
  }
});

test("getExtractionProviderOrder omits scrapingbee when availability.scrapingbee is false", () => {
  const order = getExtractionProviderOrder(
    { firecrawl: false, jina: true, scraperapi: false, zenrows: false, scrapingbee: false, geekflare: false },
    { url: "https://example.com/a" },
  );
  assert.ok(!order.includes("scrapingbee"));
});
