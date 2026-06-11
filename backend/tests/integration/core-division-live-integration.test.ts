import test from "node:test";
import assert from "node:assert/strict";
import fixtureSources from "../fixtures/india-democracy-sources.json" with { type: "json" };
import { runResearchPipeline } from "../../src/core/pipeline/research-pipeline.js";

test("core divisions consume EvidencePacks and produce D7/D11 evidence-backed outputs", async () => {
  const result = await runResearchPipeline({
    requestId: "division-live",
    userQuery: "India democratic space 2022-2025 press freedom and electoral integrity",
    mode: "council",
    archiveText: "India democratic space archive with press freedom and UAPA notes",
    preloadedSources: fixtureSources as any,
    generationMode: "deterministic",
  });

  assert.match(result.divisionOutputs.get("debate_utility") ?? "", /\[Source \d+\]\(https?:\/\//);
  assert.match(result.divisionOutputs.get("strategic_insights") ?? "", /D1|D7|central contradiction|strategy/i);
  assert.ok(result.researchAngles.length > 0);
  assert.equal(result.qualityGate.passed, true);
});
