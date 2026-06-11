import test from "node:test";
import assert from "node:assert/strict";
import { inferResearchMode, RESEARCH_LIMITS } from "../src/core/config/research-mode.js";

test("explicit UI research mode wins over prompt wording", () => {
  assert.equal(inferResearchMode("quick note but use full depth", "fast_research"), "fast_research");
  assert.equal(inferResearchMode("brief please", "council"), "council");
});

test("research mode limits scale from fast to council", () => {
  assert.ok(RESEARCH_LIMITS.fast_research.maxTotalQueries >= 40);
  assert.ok(RESEARCH_LIMITS.deep_research.maxTotalQueries >= 35);
  assert.ok(RESEARCH_LIMITS.deep_research.maxTotalQueries >= 60);
  assert.ok(RESEARCH_LIMITS.council.maxTotalQueries >= 80);
  assert.equal(RESEARCH_LIMITS.council.minFinalUniqueCitedSources, 30);
});
