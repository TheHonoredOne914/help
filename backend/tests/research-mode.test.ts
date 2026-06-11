import test from "node:test";
import assert from "node:assert/strict";
import { inferResearchMode, RESEARCH_LIMITS } from "../src/core/config/research-mode.js";

test("explicit research mode wins over query hints", () => {
  assert.equal(inferResearchMode("quick brief note", "deep_research"), "deep_research");
});

test("query wording infers fast, deep, phd, and council modes", () => {
  assert.equal(inferResearchMode("quick prep for committee"), "fast_research");
  assert.equal(inferResearchMode("deep detailed research brief"), "deep_research");
  assert.equal(inferResearchMode("maximum depth PhD thesis report"), "deep_research");
  assert.equal(inferResearchMode("run council analysis"), "council");
});

test("mode limits scale source and repair targets", () => {
  assert.equal(RESEARCH_LIMITS.fast_research.minFinalUniqueCitedSources, 40);
  assert.equal(RESEARCH_LIMITS.deep_research.minFinalUniqueCitedSources, 80);
  assert.equal(RESEARCH_LIMITS.deep_research.minFinalUniqueCitedSources, 30);
  assert.equal(RESEARCH_LIMITS.council.minCitationEligibleSources, 45);
  assert.ok(RESEARCH_LIMITS.fast_research.maxTotalQueries < RESEARCH_LIMITS.council.maxTotalQueries);
});
