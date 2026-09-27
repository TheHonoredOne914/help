import test from "node:test";
import assert from "node:assert/strict";
import { enrichSources } from "../../src/core/retrieval/source-enrichment.js";

test("Jina succeeds first for gov URLs without needing Firecrawl fallback", async () => {
  const previousLocal = process.env.LOCAL_EXTRACTOR_FIRST;
  process.env.LOCAL_EXTRACTOR_FIRST = "false";
  const errors: string[] = [];
  try {
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
        return new Response(
          ("Jina markdown from fallback with enough parliamentary content about India elections and PIB releases for enrichment quality. "
            + "The Commission required labelled AI political ads and timely takedown of notified deepfakes under the Model Code of Conduct. ").repeat(2),
          { status: 200 },
        );
      },
    });

    assert.equal(enriched[0].extractionProvider, "jina");
    assert.equal(enriched[0].extractionStatus, "success");
    // Jina is first for gov_static; Firecrawl is escalate-only and should not run.
    assert.equal(enriched[0].fallbackExtractionUsed, false);
    assert.doesNotMatch(errors.join("\n"), /fc-test-secret|jina-test-secret/);
  } finally {
    if (previousLocal === undefined) delete process.env.LOCAL_EXTRACTOR_FIRST;
    else process.env.LOCAL_EXTRACTOR_FIRST = previousLocal;
  }
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
