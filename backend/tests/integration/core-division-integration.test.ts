import test from "node:test";
import assert from "node:assert/strict";
import fixtureSources from "../fixtures/india-democracy-sources.json" with { type: "json" };
import { runResearchPipeline } from "../../src/core/pipeline/research-pipeline.js";

test("core divisions receive EvidencePacks, safe archive routing, and research angles", async () => {
  const result = await runResearchPipeline({
    requestId: "division-core",
    userQuery: "India democratic space 2022-2025 press freedom and electoral integrity",
    mode: "council",
    archiveText: "India democratic space archive with press freedom and UAPA civil liberties notes",
    preloadedSources: fixtureSources as any,
  });

  assert.equal(result.archiveRouting?.suggestedAction, "attach_to_workspace");
  assert.ok(result.researchAngles.length >= 5);
  assert.ok(result.divisionOutputs?.size);
  assert.match(result.divisionOutputs?.get("debate_utility") ?? "", /\[Source \d+\]\(https?:\/\//);
  assert.match(result.divisionOutputs?.get("strategic_insights") ?? "", /Research Angle|central contradiction/i);
  assert.equal(result.qualityGate.passed, true);
});
