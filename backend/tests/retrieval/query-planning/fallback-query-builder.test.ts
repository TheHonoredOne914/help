import test from "node:test";
import assert from "node:assert/strict";

import { buildAgendaContract } from "../../../src/core/agenda/agenda-contract.js";
import { buildFallbackQueriesForBucket } from "../../../src/core/retrieval/query-planning/fallback-query-builder.js";

test("fallback queries are topic-aware and avoid unrelated static NCRB/CAG/MEA fallbacks", () => {
  const contract = buildAgendaContract({ originalUserQuery: "ONDC digital commerce policy India", outputDepth: "detailed" });
  const queries = buildFallbackQueriesForBucket(contract, "government_official").map((query) => query.query);
  const joined = queries.join("\n");

  assert.match(joined, /\bONDC\b/i);
  assert.doesNotMatch(joined, /\bNCRB\b|\bCAG\b|\bIPC\b|\bMEA\b|Freedom House/i);
});

test("food policy fallback targets food, agriculture, and welfare sources", () => {
  const contract = buildAgendaContract({ originalUserQuery: "food security, MSP, and PDS reform India", outputDepth: "detailed" });
  const joined = buildFallbackQueriesForBucket(contract, "policy_research").map((query) => query.query).join("\n");

  assert.match(joined, /food|PDS|MSP|agriculture|welfare/i);
  assert.doesNotMatch(joined, /\bterrorism\b|\bdefence\b/i);
});
