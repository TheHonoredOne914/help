import test from "node:test";
import assert from "node:assert/strict";

import { buildAgendaContract } from "../../../src/core/agenda/agenda-contract.js";
import { buildTopicAwareTopUpQuery } from "../../../src/core/retrieval/query-planning/top-up-query-builder.js";

test("top-up queries are clean search-engine-friendly patterns", () => {
  const contract = buildAgendaContract({ originalUserQuery: "ONDC digital commerce policy India", outputDepth: "detailed" });
  const query = buildTopicAwareTopUpQuery("government_official", contract);

  assert.match(query, /\bONDC\b/i);
  assert.match(query, /\bIndia\b/i);
  assert.doesNotMatch(query, /Government and official records evidence/i);
  assert.doesNotMatch(query, /\b(?:official_position|primary_numbers|debate_utility)\b/i);
});
