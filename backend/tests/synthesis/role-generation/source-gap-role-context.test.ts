import test from "node:test";
import assert from "node:assert/strict";
import { buildSourceGapRoleContext } from "../../../src/core/synthesis/role-generation/source-gap-role-context.js";

test("SourceGapReport context gives retrieval critic missing and weak buckets", () => {
  const context = buildSourceGapRoleContext("retrieval_critic", {
    requiredUniqueSources: 30,
    availableCitationEligibleSources: 8,
    failedBuckets: ["court_legal"],
    weakBuckets: ["parliamentary_records"],
    attemptedQueries: ["query one"],
    providerErrors: [],
    enrichmentFailures: [],
    explanation: "Fewer than 30 sources.",
    repairAttempted: false,
  });

  assert.match(context, /court_legal/);
  assert.match(context, /parliamentary_records/);
  assert.match(context, /insufficient full-text evidence|low citation strength|overrepresented/i);
});
