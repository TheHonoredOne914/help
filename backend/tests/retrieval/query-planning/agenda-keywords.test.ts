import test from "node:test";
import assert from "node:assert/strict";

import { buildAgendaContract } from "../../../src/core/agenda/agenda-contract.js";
import { extractAgendaKeywords } from "../../../src/core/retrieval/query-planning/agenda-keywords.js";

test("agenda keyword extraction preserves Indian parliamentary and domain terms", () => {
  const contract = buildAgendaContract({
    originalUserQuery: "Indian Parliament committee brief on Article 21, Supreme Court doctrine, and ONDC in 2026",
    outputDepth: "detailed",
  });

  const keywords = extractAgendaKeywords(contract);

  assert.match(keywords, /\bIndian\b|\bIndia\b/);
  assert.match(keywords, /\bParliament\b/i);
  assert.match(keywords, /\bcommittee\b/i);
  assert.match(keywords, /\bArticle 21\b/i);
  assert.match(keywords, /\bSupreme Court\b/i);
  assert.match(keywords, /\bONDC\b/);
  assert.doesNotMatch(keywords, /\baccountability\b/i);
});

test("empty or prompt-like agendas do not fall back to accountability", () => {
  const contract = buildAgendaContract({
    originalUserQuery: "prepare research",
    outputDepth: "brief",
  });

  const keywords = extractAgendaKeywords(contract);

  assert.ok(keywords.length > 0);
  assert.doesNotMatch(keywords, /\baccountability\b/i);
});

test("agenda keyword extraction strips fast-research instruction wrappers", () => {
  const contract = buildAgendaContract({
    originalUserQuery: [
      "Fast research for an AIPPM debate in India:",
      "Should the Election Commission and Union Government regulate online political advertising, deepfakes, and platform transparency during elections?",
      "Produce at least 1000 words for Indian Mock Parliament use with Treasury Bench arguments, Opposition attacks, POIs, rebuttals, motions, amendments, and committee recommendations.",
    ].join(" "),
    outputDepth: "detailed",
  });

  const keywords = extractAgendaKeywords(contract);

  assert.match(keywords, /\bElection Commission\b/i);
  assert.match(keywords, /\bUnion Government\b/i);
  assert.match(keywords, /\bonline\b/i);
  assert.match(keywords, /\bdeepfakes\b/i);
  assert.doesNotMatch(keywords, /\bFast\b/i);
  assert.doesNotMatch(keywords, /\bAIPPM\b/i);
  assert.doesNotMatch(keywords, /\bTreasury Bench\b/i);
  assert.doesNotMatch(keywords, /\b1000\b/i);
});
