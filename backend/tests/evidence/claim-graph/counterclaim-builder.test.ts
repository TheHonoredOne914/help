import test from "node:test";
import assert from "node:assert/strict";
import { buildValidatedGraph } from "./helpers.js";

test("counterclaims are created from challenges_claim items", () => {
  const { claimGraph } = buildValidatedGraph();
  assert.ok((claimGraph.counterclaims?.length ?? 0) >= 1);
  assert.ok(claimGraph.counterclaims?.some((counterclaim) => /Watchdog alleges/i.test(counterclaim.text)));
});
