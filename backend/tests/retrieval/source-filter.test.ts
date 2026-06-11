import test from "node:test";
import assert from "node:assert/strict";

import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { filterSourcesForAgenda } from "../../src/core/retrieval/source-filter.js";

test("source filter preserves rejection reasons for malformed URLs", () => {
  const contract = buildAgendaContract({
    requestId: "source-filter-invalid-url",
    originalUserQuery: "Article 21 privacy proportionality India Supreme Court",
  });

  const result = filterSourcesForAgenda([
    {
      title: "Supreme Court Article 21 privacy proportionality",
      url: "not a url",
      snippet: "India Supreme Court Article 21 privacy proportionality judgment analysis ".repeat(4),
    },
  ], contract, { withReasons: true });

  assert.equal(result.kept.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0]?.reason, "invalid_url");
  assert.match(result.rejected[0]?.detail ?? "", /malformed|invalid/i);
});

test("source filter rejects false India relevance from names alone", () => {
  const contract = buildAgendaContract({
    requestId: "source-filter-false-india",
    originalUserQuery: "Article 21 privacy proportionality India Supreme Court",
  });

  const result = filterSourcesForAgenda([
    {
      title: "Patel procedure in United Kingdom civil courts",
      url: "https://example.org/patel-procedure",
      snippet: "Patel procedure in civil litigation evidence disclosure and court procedure outside South Asia. ".repeat(5),
    },
  ], contract, { withReasons: true });

  assert.equal(result.kept.length, 0);
  assert.equal(result.rejected[0]?.reason, "india_relevance");
});
