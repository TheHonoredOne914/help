import test from "node:test";
import assert from "node:assert/strict";

import {
  enforceQueryMinimums,
  validatePlannedQueries,
  type PlannedQueries,
} from "../../../src/services/research-planner.js";

const emptyPlan = (): PlannedQueries => ({
  data_analyst: [],
  legal_researcher: [],
  policy_analyst: [],
  current_affairs: [],
  media_journalist: [],
});

test("legacy planner preserves short Indian policy acronyms", () => {
  assert.deepEqual(validatePlannedQueries(["RTI", "GST", "UAPA", "AI"]), [
    "RTI",
    "GST",
    "UAPA",
  ]);
});

test("legacy planner uses topic-specific fallback seeds without stale topic bleed", () => {
  const enforced = enforceQueryMinimums(
    emptyPlan(),
    "DPDP Act personal data protection India",
    "technology_data_ai_governance" as any,
  );

  const joined = [
    ...enforced.data_analyst,
    ...enforced.legal_researcher,
    ...enforced.policy_analyst,
    ...enforced.current_affairs,
    ...(enforced.media_journalist ?? []),
  ].join("\n");

  assert.match(joined, /DPDP|personal data|digital|privacy|MeitY|data protection/i);
  assert.doesNotMatch(joined, /Freedom House|V-Dem|EVM|VVPAT|NCRB crime|CAG audit/i);
});
