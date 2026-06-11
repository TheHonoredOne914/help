import test from "node:test";
import assert from "node:assert/strict";

import { buildAgendaContract } from "../../../src/core/agenda/agenda-contract.js";
import { buildParliamentaryQueries } from "../../../src/core/retrieval/query-planning/parliamentary-query-builder.js";

test("Indian parliamentary topics include Sansad, PRS, questions, bills, and committee targeting", () => {
  const contract = buildAgendaContract({ originalUserQuery: "ONDC digital commerce regulation in Indian Parliament", outputDepth: "detailed" });
  const joined = buildParliamentaryQueries(contract).map((query) => query.query).join("\n");

  assert.match(joined, /site:sansad\.in/i);
  assert.match(joined, /site:prsindia\.org/i);
  assert.match(joined, /question|bill|committee/i);
});
