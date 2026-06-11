import test from "node:test";
import assert from "node:assert/strict";
import { extractWithFallback } from "../../src/core/search/search-provider-router.js";

test("Firecrawl extraction success normalizes markdown and provider metadata", async () => {
  const result = await extractWithFallback("https://pib.gov.in/release", {
    keys: { firecrawl: "fc-test", jina: "jina-test" },
    fetchFn: async (url) => {
      assert.equal(String(url), "https://api.firecrawl.dev/v1/scrape");
      return new Response(JSON.stringify({ success: true, data: { markdown: "# PIB release", title: "PIB" } }), { status: 200 });
    },
  });

  assert.equal(result.provider, "firecrawl");
  assert.equal(result.status, "success");
  assert.equal(result.markdown, "# PIB release");
});

test("Firecrawl failure falls back to Jina and then snippet fallback", async () => {
  let calls = 0;
  const jinaResult = await extractWithFallback("https://example.com/a", {
    keys: { firecrawl: "fc-test", jina: "jina-test" },
    fetchFn: async (url) => {
      calls += 1;
      if (String(url).includes("firecrawl")) return new Response("rate limited", { status: 429 });
      return new Response("Readable Jina text", { status: 200 });
    },
  });

  assert.equal(calls, 2);
  assert.equal(jinaResult.provider, "jina");
  assert.equal(jinaResult.status, "success");

  const snippetResult = await extractWithFallback("https://example.com/b", {
    keys: { firecrawl: "fc-test", jina: "jina-test" },
    snippet: "Snippet only",
    fetchFn: async () => new Response("failed", { status: 500 }),
  });

  assert.equal(snippetResult.provider, "snippet_fallback");
  assert.equal(snippetResult.status, "partial");
  assert.equal(snippetResult.excerpt, "Snippet only");
});
