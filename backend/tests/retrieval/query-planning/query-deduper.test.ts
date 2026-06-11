import test from "node:test";
import assert from "node:assert/strict";

import { deduplicateQueryTexts } from "../../../src/core/retrieval/query-planning/query-deduper.js";

test("query deduper preserves acronyms while removing near duplicates", () => {
  const deduped = deduplicateQueryTexts([
    "GST Council compensation cess India",
    "gst council compensation cess india",
    "ONDC India digital commerce policy",
    "site:sansad.in ONDC digital commerce policy",
    "site:pib.gov.in ONDC digital commerce policy",
    "UAPA bail Supreme Court PIL India",
  ]);

  assert.equal(deduped.filter((query) => /GST/.test(query)).length, 1);
  assert.ok(deduped.some((query) => /\bONDC\b/.test(query)));
  assert.ok(deduped.some((query) => /\bUAPA\b/.test(query) && /\bPIL\b/.test(query)));
  assert.ok(deduped.some((query) => /site:sansad\.in/.test(query)));
  assert.ok(deduped.some((query) => /site:pib\.gov\.in/.test(query)));
});
