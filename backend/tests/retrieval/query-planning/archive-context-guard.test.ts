import test from "node:test";
import assert from "node:assert/strict";

import { buildSearchSubjectWithArchiveGuard } from "../../../src/core/retrieval/query-planning/archive-context-guard.js";

test("unrelated archive topics do not contaminate the current search subject", () => {
  const guarded = buildSearchSubjectWithArchiveGuard("ONDC digital commerce policy", {
    archiveTopic: "AI governance and deepfakes",
    archiveSummary: "algorithmic bias, generative AI, and synthetic media",
  });

  assert.match(guarded.searchSubject, /\bONDC\b/i);
  assert.doesNotMatch(guarded.searchSubject, /deepfake|algorithmic|generative AI/i);
  assert.equal(guarded.archiveUsed, false);
});
