import test from "node:test";
import assert from "node:assert/strict";
import { enrichSources } from "../../src/core/retrieval/source-enrichment.js";

test("Firecrawl failure falls back to Jina and records safe extraction failure", async () => {
  const errors: string[] = [];
  const enriched = await enrichSources([{
    title: "PIB release",
    url: "https://pib.gov.in/release",
    domain: "pib.gov.in",
    snippet: "PIB snippet",
  }], {
    firecrawlKey: "fc-test-secret",
    jinaKey: "jina-test-secret",
    onError: (error) => errors.push(error),
    fetchFn: async (url) => {
      if (String(url).includes("firecrawl")) {
        return new Response("network failed fc-test-secret", { status: 500 });
      }
      return new Response("Jina markdown from fallback", { status: 200 });
    },
  });

  assert.equal(enriched[0].extractionProvider, "jina");
  assert.equal(enriched[0].extractionStatus, "success");
  assert.equal(enriched[0].fallbackExtractionUsed, true);
  assert.match(errors.join("\n"), /network failed|\[REDACTED\]/);
  assert.doesNotMatch(errors.join("\n"), /fc-test-secret|jina-test-secret/);
});

test("Jina failure falls back to snippet with non-empty safe error metadata", async () => {
  const errors: string[] = [];
  const enriched = await enrichSources([{
    title: "Court source",
    url: "https://main.sci.gov.in/judgment.pdf",
    domain: "main.sci.gov.in",
    snippet: "Supreme Court snippet",
  }], {
    firecrawlKey: "fc-test-secret",
    jinaKey: "jina-test-secret",
    onError: (error) => errors.push(error),
    fetchFn: async () => new Response("network failed jina-test-secret", { status: 500 }),
  });

  assert.equal(enriched[0].extractionProvider, "snippet_fallback");
  assert.equal(enriched[0].extractionStatus, "partial");
  assert.equal(enriched[0].fallbackExtractionUsed, true);
  assert.match(enriched[0].enrichmentError ?? "", /network failed|\[REDACTED\]/);
  assert.doesNotMatch(`${errors.join("\n")} ${enriched[0].enrichmentError}`, /fc-test-secret|jina-test-secret/);
});
