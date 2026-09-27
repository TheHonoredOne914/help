import test from "node:test";
import assert from "node:assert/strict";
import { preferLocalExtractOverSnippet, preferPartialLocalBody } from "../../../src/core/retrieval/enrichment/enrich-source.js";
import type { ExtractorResult } from "../../../src/core/retrieval/enrichment/types.js";

const sourceBase = {
  title: "Privacy Article",
  url: "https://example.com/privacy",
  domain: "example.com",
};

test("180-char local body beats 40-char snippet", () => {
  const text = "The Digital Personal Data Protection Act establishes a comprehensive framework for data privacy in India and sets obligations on data fiduciaries. ".repeat(1).trim();
  assert.ok(text.length >= 120 && text.length < 300);
  const local: ExtractorResult = {
    url: sourceBase.url,
    title: sourceBase.title,
    text,
    extractionMethod: "readability_fetch",
    extractionStatus: "partial",
  };
  const result = preferLocalExtractOverSnippet(local, {
    ...sourceBase,
    snippet: "Short search snippet about privacy law.",
  });
  assert.ok(result);
  assert.equal(result.extractionStatus, "partial");
  assert.equal(result.extractionMethod, "readability_fetch");
  assert.notEqual(result.extractionMethod, "snippet_fallback");
  assert.equal(result.fallbackExtractionUsed, false);
});

test("local shorter than snippet returns null", () => {
  const local: ExtractorResult = {
    url: sourceBase.url,
    text: "A".repeat(150),
    extractionMethod: "readability_fetch",
    extractionStatus: "partial",
  };
  assert.equal(
    preferLocalExtractOverSnippet(local, { ...sourceBase, snippet: "B".repeat(200) }),
    null,
  );
});

test("local shell chrome text returns null", () => {
  const text = "you need to enable javascript to run this app ".repeat(3).trim();
  assert.ok(text.length >= 120);
  const local: ExtractorResult = {
    url: sourceBase.url,
    text,
    extractionMethod: "readability_fetch",
    extractionStatus: "partial",
  };
  assert.equal(
    preferLocalExtractOverSnippet(local, { ...sourceBase, snippet: "tiny snippet" }),
    null,
  );
});

test("local failed status returns null", () => {
  const local: ExtractorResult = {
    url: sourceBase.url,
    text: "Substantive extracted body text that exceeds one hundred twenty characters and should otherwise qualify over a short search snippet fallback.",
    extractionMethod: "failed",
    extractionStatus: "failed",
    error: "fetch failed",
  };
  assert.equal(
    preferLocalExtractOverSnippet(local, { ...sourceBase, snippet: "short snippet" }),
    null,
  );
});

test("high-value host keeps short local body over longer search snippet", () => {
  const text = "The Election Commission directed platforms to label AI-generated political ads and remove notified deepfakes within three hours of a verified complaint.";
  assert.ok(text.length >= 120 && text.length < 300);
  const local: ExtractorResult = {
    url: "https://eci.gov.in/ai-advisory",
    title: "ECI advisory",
    text,
    extractionMethod: "readability_fetch",
    extractionStatus: "partial",
  };
  const result = preferLocalExtractOverSnippet(local, {
    title: "ECI advisory",
    url: "https://eci.gov.in/ai-advisory",
    domain: "eci.gov.in",
    snippet: "B".repeat(text.length + 80),
  });
  assert.ok(result, "eci.gov.in must prefer real local body over longer SEO snippet");
  assert.equal(result.extractionMethod, "readability_fetch");
  assert.equal(result.fallbackExtractionUsed, false);
  assert.equal(result.extractionStatus, "partial");
});

test("preferPartialLocalBody keeps mid-tier local body when SEO snippet is longer", () => {
  const text = "Platform transparency rules for political advertising require disclosure of funding sources and targeting criteria before election day in India.";
  assert.ok(text.length >= 120 && text.length < 300);
  const local: ExtractorResult = {
    url: "https://example.com/platform-rules",
    text,
    extractionMethod: "readability_fetch",
    extractionStatus: "partial",
  };
  const source = { ...sourceBase, url: local.url, snippet: "S".repeat(text.length + 100) };
  assert.equal(preferLocalExtractOverSnippet(local, source), null, "length-gated preferLocal must still null mid-tier");
  const kept = preferPartialLocalBody(local, source);
  assert.ok(kept);
  assert.equal(kept.extractionMethod, "readability_fetch");
  assert.equal(kept.fallbackExtractionUsed, false);
});

test("preferPartialLocalBody rejects shells and snippet methods", () => {
  const shell = "you need to enable javascript to run this app ".repeat(4).trim();
  assert.equal(
    preferPartialLocalBody({
      url: sourceBase.url,
      text: shell,
      extractionMethod: "readability_fetch",
      extractionStatus: "partial",
    }, sourceBase),
    null,
  );
  assert.equal(
    preferPartialLocalBody({
      url: sourceBase.url,
      text: "A".repeat(200),
      extractionMethod: "snippet_fallback",
      extractionStatus: "partial",
      fallbackExtractionUsed: true,
    }, sourceBase),
    null,
  );
});
