import test from "node:test";
import assert from "node:assert/strict";
import { enrichSource } from "../../src/core/retrieval/source-enrichment.js";
import { firecrawlExtractorProvider } from "../../src/core/search/providers/firecrawl-extractor-provider.js";

test("source enrichment passes abort signal into readability fetch", async () => {
  const controller = new AbortController();
  let observedSignal: AbortSignal | undefined;

  await enrichSource({
    title: "PIB source",
    url: "https://pib.gov.in/example",
    domain: "pib.gov.in",
    snippet: "official source",
  }, {
    timeoutMs: 1_000,
    abortSignal: controller.signal,
    fetchFn: async (_url, init) => {
      observedSignal = init?.signal as AbortSignal | undefined;
      return new Response("<html><article><p>Official PIB article text with enough density for extraction.</p></article></html>");
    },
  } as any);

  assert.ok(observedSignal instanceof AbortSignal);
  assert.equal(observedSignal.aborted, false);
});

test("Firecrawl extraction requests markdown only", async () => {
  let body: any;
  await firecrawlExtractorProvider.extract("https://example.com/article", { firecrawl: "fc-test" }, {
    timeoutMs: 1_000,
    fetchFn: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ data: { markdown: "article markdown" } }), { status: 200 });
    },
  });

  assert.deepEqual(body.formats, ["markdown"]);
});
