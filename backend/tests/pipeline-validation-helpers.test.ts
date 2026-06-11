import { test } from "node:test";
import assert from "node:assert/strict";

import { validateEvidenceRegistryCompleteness } from "../src/lib/evidence-registry.ts";
import type { DimensionEngineOutput, EvidenceRegistry } from "../src/lib/types.ts";
import { enforceQueryMinimums, type PlannedQueries } from "../src/services/research-planner.ts";

test("enforceQueryMinimums pads every research role to thesis-grade minimums", () => {
  const planned: PlannedQueries = {
    data_analyst: ["seed data"],
    legal_researcher: [],
    policy_analyst: [],
    current_affairs: [],
    media_journalist: [],
  };

  const enforced = enforceQueryMinimums(planned, "Article 356 governor role", "governance");

  assert.ok(enforced.data_analyst.length >= 6);
  assert.ok(enforced.legal_researcher.length >= 5);
  assert.ok(enforced.policy_analyst.length >= 5);
  assert.ok(enforced.current_affairs.length >= 4);
  assert.ok((enforced.media_journalist ?? []).length >= 4);
});

test("validateEvidenceRegistryCompleteness reports missing activated dimensions", () => {
  const registry = {
    sources: [
      { index: 1, title: "Judgment", url: "https://indiankanoon.org/doc/1", canonicalUrl: "indiankanoon.org/doc/1", sourceType: "court_judgement", tier: "tier1", hasFullContent: true, snippet: "constitutional law", content: "constitutional law", score: 10, dimensions: ["constitutional"] },
    ],
    tier1Sources: [],
    tier2Sources: [],
    tier3Sources: [],
    tier4Sources: [],
    tier5Sources: [],
    agendaText: "Article 356",
    queryTimestamp: new Date().toISOString(),
    courtJudgements: [],
    govReports: [],
    snippetOnlySources: [],
    conflictedClaims: [],
    evidenceGaps: [],
  } as unknown as EvidenceRegistry;
  registry.tier1Sources = registry.sources;
  const engine = {
    primaryDimensions: [{ name: "constitutional" }, { name: "federalism" }],
    secondaryDimensions: [{ name: "political" }],
  } as unknown as DimensionEngineOutput;

  const result = validateEvidenceRegistryCompleteness(registry, engine);

  assert.equal(result.complete, false);
  assert.deepEqual(result.missingDimensions.sort(), ["federalism", "political"]);
  assert.equal(Math.round(result.coverageScore), 33);
});
