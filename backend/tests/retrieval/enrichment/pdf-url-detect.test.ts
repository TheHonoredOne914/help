import test from "node:test";
import assert from "node:assert/strict";
import { isPdfUrl } from "../../../src/core/retrieval/enrichment/extractors/pdf-extractor.js";

test("isPdfUrl detects .pdf extension", () => {
  assert.equal(isPdfUrl("https://example.com/doc.pdf"), true);
});

test("isPdfUrl detects ECI api/download URLs", () => {
  assert.equal(
    isPdfUrl("https://www.eci.gov.in/eci-backend/public/api/download?url=abc"),
    true,
  );
});

test("isPdfUrl detects /download/ path segment", () => {
  assert.equal(isPdfUrl("https://example.com/files/download/report"), true);
});

test("isPdfUrl detects format=pdf query param", () => {
  assert.equal(isPdfUrl("https://example.com/page?format=pdf"), true);
});

test("isPdfUrl detects SCI sci-get-pdf judgment endpoints", () => {
  assert.equal(
    isPdfUrl("https://sci.gov.in/sci-get-pdf/?diary_no=357852025&from=latest_judgements_order&order_date=2026-05-27&type=j"),
    true,
  );
  assert.equal(isPdfUrl("https://main.sci.gov.in/pdfviewer/doc/123"), true);
});

test("isPdfUrl rejects normal HTML pages", () => {
  assert.equal(isPdfUrl("https://thehindu.com/news/story"), false);
  assert.equal(isPdfUrl("https://pib.gov.in/PressReleasePage.aspx?PRID=2019760"), false);
});
