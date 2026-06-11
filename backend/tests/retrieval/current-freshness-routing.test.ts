import test from "node:test";
import assert from "node:assert/strict";
import { detectFreshnessNeeded } from "../../src/core/freshness/freshness-router.js";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";

test("current personal or office facts trigger freshness search", () => {
  assert.equal(detectFreshnessNeeded("Raghav Chadha current party", "normal").needed, true);
  assert.equal(detectFreshnessNeeded("current CM of Maharashtra", "rhetorics").needed, true);
  assert.equal(detectFreshnessNeeded("current MLA from Okhla", "drafting").needed, true);
});

test("current conflicts, judgments, bills, protests, and elections trigger freshness search", () => {
  for (const query of [
    "current US-Iran war status",
    "latest Supreme Court ruling on internet shutdowns",
    "recent bill on data protection",
    "recent protest in Manipur",
    "2026 election result",
  ]) {
    assert.equal(detectFreshnessNeeded(query, "normal").needed, true, query);
  }
});

test("static constitutional explainer does not trigger unnecessary search", () => {
  assert.equal(detectFreshnessNeeded("Explain Article 21 proportionality doctrine", "normal").needed, false);
});

test("current-event query without explicit year prefers current year while preserving explicit years", () => {
  const current = buildAgendaContract({ originalUserQuery: "current US-Iran war status" });
  assert.equal(current.temporalScope.endYear, new Date().getFullYear());
  assert.equal(current.temporalScope.explicit, false);

  const explicit = buildAgendaContract({ originalUserQuery: "India press freedom 2024 2025" });
  assert.equal(explicit.temporalScope.startYear, 2024);
  assert.equal(explicit.temporalScope.endYear, 2025);
  assert.equal(explicit.temporalScope.explicit, true);
});
