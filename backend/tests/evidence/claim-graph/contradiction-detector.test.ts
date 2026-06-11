import test from "node:test";
import assert from "node:assert/strict";
import { buildValidatedGraph } from "./helpers.js";

test("numeric, trend, and official-watchdog contradictions are detected conservatively", () => {
  const { claimGraph } = buildValidatedGraph();
  console.log(claimGraph.contradictions);
  assert.ok(claimGraph.contradictions?.some((item) => item.type === "official_watchdog_conflict" || item.type === "trend_direction_conflict"));
});
