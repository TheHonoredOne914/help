import test from "node:test";
import assert from "node:assert/strict";

import { buildSearchSubject } from "../../../src/lib/query-planner.js";
import { enforceQueryMinimums, type PlannedQueries } from "../../../src/services/research-planner.js";
import { engineerQueryForIndia } from "../../../src/lib/web-search.js";

test("legacy search subject builder does not prepend unrelated archive topic", () => {
  const subject = buildSearchSubject("ONDC digital commerce policy", "AI governance and deepfakes");

  assert.match(subject, /\bONDC\b/i);
  assert.doesNotMatch(subject, /deepfake|AI governance/i);
});

test("legacy query minimums use official topic-aware fallbacks", () => {
  const planned: PlannedQueries = {
    data_analyst: [],
    legal_researcher: [],
    policy_analyst: [],
    current_affairs: [],
    media_journalist: [],
  };
  const enforced = enforceQueryMinimums(planned, "ONDC digital commerce policy India", "governance_policy");
  const joined = [
    ...enforced.data_analyst,
    ...enforced.legal_researcher,
    ...enforced.policy_analyst,
    ...enforced.current_affairs,
    ...(enforced.media_journalist ?? []),
  ].join("\n");

  assert.match(joined, /\bONDC\b/i);
  assert.doesNotMatch(joined, /\bNCRB\b|\bCAG\b|\bIPC\b|\bMEA\b|Freedom House/i);
});

test("legacy query minimums reject empty topic instead of generic PhD fallback", () => {
  const planned: PlannedQueries = {
    data_analyst: [],
    legal_researcher: [],
    policy_analyst: [],
    current_affairs: [],
    media_journalist: [],
  };

  assert.throws(
    () => enforceQueryMinimums(planned, "   ", "default"),
    /topic-bearing user query/i,
  );
});

test("legacy web-search engineered queries route through official planner adapter", () => {
  const queries = engineerQueryForIndia("ONDC digital commerce policy India", "serper");
  const joined = queries.join("\n");

  assert.match(joined, /\bONDC\b/i);
  assert.doesNotMatch(joined, /\bNCRB\b|\bCAG\b|\bIPC\b|\bMEA\b|Freedom House/i);
});
