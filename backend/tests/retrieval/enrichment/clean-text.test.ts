import test from "node:test";
import assert from "node:assert/strict";
import { cleanExtractedText } from "../../../src/core/retrieval/enrichment/clean-text.js";

test("cleanExtractedText strips repeated boilerplate and reports density", () => {
  const raw = [
    "Cookie settings privacy policy subscribe to our newsletter advertisement share this article login",
    "Cookie settings privacy policy subscribe to our newsletter advertisement share this article login",
    "The Supreme Court held that Article 21 protects privacy and the Union ministry must justify restrictions.",
    "Parliamentary debate records show Opposition members raised federalism objections and Treasury Bench replies.",
  ].join("\n\n");

  const cleaned = cleanExtractedText(raw);

  assert.doesNotMatch(cleaned.text, /cookie settings|subscribe|advertisement|share this article|login/i);
  assert.match(cleaned.text, /Supreme Court held that Article 21 protects privacy/i);
  assert.ok(cleaned.boilerplateRatio > 0.4);
  assert.ok(cleaned.wordCount > 10);
});

test("cleanExtractedText normalizes whitespace and removes control characters", () => {
  const cleaned = cleanExtractedText("A\u200BIPPM\u0000\t\tdebate\r\n\r\nuses   constitutional   claims.");

  assert.equal(cleaned.text, "AIPPM debate\n\nuses constitutional claims.");
  assert.equal(cleaned.wordCount, 5);
  assert.ok(cleaned.uniqueWordRatio > 0.8);
});
