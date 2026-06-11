import test from "node:test";
import assert from "node:assert/strict";

import { buildAgendaContract } from "../../../src/core/agenda/agenda-contract.js";
import { filterResolvedQueryDrift } from "../../../src/core/retrieval/query-planning/query-drift-filter.js";

test("drift filtering runs on resolved query text after agenda substitution", () => {
  const contract = buildAgendaContract({ originalUserQuery: "India democratic space", outputDepth: "detailed" });
  const result = filterResolvedQueryDrift("India democratic space artificial intelligence governance report", contract);

  assert.equal(result.accepted, false);
  assert.equal(result.driftStatus, "rejected");
  assert.deepEqual(result.detectedTerms, ["artificial intelligence"]);
});
