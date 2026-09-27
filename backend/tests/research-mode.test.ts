import test from "node:test";
import assert from "node:assert/strict";
import { inferResearchMode, RESEARCH_LIMITS } from "../src/core/config/research-mode.js";

test("explicit research mode wins over query hints", () => {
  assert.equal(inferResearchMode("quick brief note", "deep_research"), "deep_research");
});

test("query wording infers fast and deep modes", () => {
  assert.equal(inferResearchMode("quick prep for committee"), "fast_research");
  assert.equal(inferResearchMode("deep detailed research brief"), "deep_research");
  assert.equal(inferResearchMode("serious prep for the floor"), "deep_research");
  assert.equal(inferResearchMode("run council analysis"), "fast_research");
});

test("mode limits scale source and repair targets", () => {
  assert.equal(RESEARCH_LIMITS.fast_research.minCitationEligibleSources, 40);
  assert.equal(RESEARCH_LIMITS.fast_research.minFinalUniqueCitedSources, 40);
  assert.equal(RESEARCH_LIMITS.fast_research.maxSourcesToEnrich, 90);
  assert.equal(RESEARCH_LIMITS.fast_research.maxRawResults, 120);
  assert.equal(RESEARCH_LIMITS.fast_research.maxTotalQueries, 36);
  assert.equal(RESEARCH_LIMITS.fast_research.enrichmentBudgetMs, 96_000);
  assert.equal(RESEARCH_LIMITS.fast_research.maxRepairPasses, 2);
  assert.equal(RESEARCH_LIMITS.deep_research.minCitationEligibleSources, 45);
  assert.equal(RESEARCH_LIMITS.council.minCitationEligibleSources, 110);
  assert.equal(RESEARCH_LIMITS.deep_research.minFinalUniqueCitedSources, 45);
  assert.equal(RESEARCH_LIMITS.council.minFinalUniqueCitedSources, 110);
  assert.ok(RESEARCH_LIMITS.fast_research.maxTotalQueries < RESEARCH_LIMITS.council.maxTotalQueries);
});
