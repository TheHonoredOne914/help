import test from "node:test";
import assert from "node:assert/strict";

import { buildAgendaContract } from "../../../src/core/agenda/agenda-contract.js";
import { buildFreshnessQueries } from "../../../src/core/retrieval/query-planning/freshness-query-builder.js";

test("current-affairs topics get current-year and previous-year freshness queries", () => {
  const contract = buildAgendaContract({ originalUserQuery: "latest Supreme Court ruling on internet shutdowns India", outputDepth: "detailed" });
  const queries = buildFreshnessQueries(contract, "indian_major_media").map((query) => query.query).join("\n");
  const currentYear = new Date().getFullYear();

  assert.match(queries, new RegExp(String(currentYear)));
  assert.match(queries, new RegExp(String(currentYear - 1)));
  assert.match(queries, /latest|current|update|status/i);
});
