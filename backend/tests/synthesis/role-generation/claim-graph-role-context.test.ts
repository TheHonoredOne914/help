import test from "node:test";
import assert from "node:assert/strict";
import { buildClaimGraphRoleContext } from "../../../src/core/synthesis/role-generation/claim-graph-role-context.js";
import { makeClaimGraph } from "./helpers.js";

test("ClaimGraph role context is compact and filtered by assigned source ids", () => {
  const context = buildClaimGraphRoleContext(makeClaimGraph(), { roleName: "legal_analyst", assignedSourceIds: [1] });

  assert.match(context, /claim-legal/);
  assert.match(context, /counter-1/);
  assert.match(context, /contradiction-1/);
  assert.match(context, /forbidden/i);
  assert.doesNotMatch(context, /claim-weak.*SourceIds: 2/s);
});
