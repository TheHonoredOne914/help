import test from "node:test";
import assert from "node:assert/strict";
import {
  ampUrlVariant,
  classifyExtractionUrl,
  getExtractionProviderOrder,
  getSearchProviderOrder,
  getSearchProviderOrderForBucket,
  waybackAvailabilityUrl,
} from "../../src/core/search/search-fallback-policy.js";

test("fast and web research use Serper then Exa before Tavily fallback", () => {
  assert.deepEqual(getSearchProviderOrder("fast_research", { serper: true, exa: true, tavily: true, brave: true }), ["serper", "exa", "tavily", "brave"]);
  assert.deepEqual(getSearchProviderOrder("web_search", { serper: true, exa: true, tavily: true }), ["serper", "exa", "tavily"]);
});

test("deep and strict research combine Serper and Exa before fallback providers", () => {
  assert.deepEqual(getSearchProviderOrder("deep_research", { serper: true, exa: true, tavily: true }), ["serper", "exa", "tavily"]);
  assert.deepEqual(getSearchProviderOrder("council", { exa: true, tavily: true }), ["exa", "tavily"]);
});

test("bucket-aware provider order differs by mode", () => {
  const available = { serper: true, exa: true, tavily: true, brave: true };
  assert.deepEqual(getSearchProviderOrderForBucket("court_legal", "deep_research", available).slice(0, 2), ["serper", "exa"]);
  assert.deepEqual(getSearchProviderOrderForBucket("indian_major_media", "deep_research", available).slice(0, 2), ["serper", "brave"]);
  assert.deepEqual(getSearchProviderOrderForBucket("academic_research", "deep_research", available).slice(0, 2), ["exa", "serper"]);
  assert.deepEqual(getSearchProviderOrderForBucket("policy_research", "deep_research", available)[0], "exa");
  // Generic web buckets prefer Exa before Brave so working Exa/Tavily keys are not stranded.
  assert.deepEqual(getSearchProviderOrderForBucket("civic_space", "deep_research", available).slice(0, 2), ["serper", "exa"]);
});

test("extraction prefers jina; firecrawl escalate-only for gov/unknown, included for default/paywalled", () => {
  assert.deepEqual(getExtractionProviderOrder({ firecrawl: true, jina: true }), ["jina", "snippet_fallback"]);
  assert.deepEqual(getExtractionProviderOrder({ firecrawl: true, jina: true }, { escalateFirecrawl: true }), ["jina", "firecrawl", "snippet_fallback"]);
  assert.deepEqual(getExtractionProviderOrder({ firecrawl: false, jina: true }), ["jina", "snippet_fallback"]);
  assert.deepEqual(
    getExtractionProviderOrder({ firecrawl: true, jina: true }, { url: "https://www.thehindu.com/news/national/example" }),
    ["jina", "firecrawl", "snippet_fallback"],
  );
  assert.deepEqual(
    getExtractionProviderOrder({ firecrawl: true, jina: true }, { url: "https://pib.gov.in/release" }),
    ["jina", "snippet_fallback"],
  );
});

test("non-gov PDFs are default class and include Firecrawl after Jina", () => {
  assert.equal(
    classifyExtractionUrl("https://livelaw.in/pdf_upload/judgment.pdf"),
    "default",
  );
  assert.equal(
    classifyExtractionUrl("https://adrindia.org/sites/default/files/report.pdf"),
    "default",
  );
  // Gov host PDFs stay gov_static by host, but still get Firecrawl in the order (PDF exception).
  assert.equal(
    classifyExtractionUrl("https://eci.gov.in/docs/handbook.pdf"),
    "gov_static",
  );
  assert.deepEqual(
    getExtractionProviderOrder(
      { firecrawl: true, jina: true },
      { url: "https://livelaw.in/pdf_upload/judgment.pdf" },
    ),
    ["jina", "firecrawl", "snippet_fallback"],
  );
  assert.deepEqual(
    getExtractionProviderOrder(
      { firecrawl: true, jina: true },
      { url: "https://eci.gov.in/docs/handbook.pdf" },
    ),
    ["jina", "firecrawl", "snippet_fallback"],
  );
});

test("URL class helpers for paywall amp/wayback", () => {
  assert.equal(classifyExtractionUrl("https://indiankanoon.org/doc/1/"), "gov_static");
  assert.equal(classifyExtractionUrl("https://www.ft.com/content/abc"), "paywalled");
  assert.ok(ampUrlVariant("https://www.ft.com/content/abc")?.includes("amp."));
  assert.ok(waybackAvailabilityUrl("https://www.ft.com/content/abc").includes("web.archive.org"));
});
