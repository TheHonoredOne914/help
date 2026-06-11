import test from "node:test";
import assert from "node:assert/strict";
import { generateCoreResearchAnswer } from "../../src/core/generation/core-answer-generator.js";
import { createFakeResearchRun } from "../harness/fake-evidence-registry.js";

test("live model generation cannot synthesize SourceUsageMap without explicit test/deterministic opt-in", async () => {
  const run = createFakeResearchRun(10, "fast_research");

  await assert.rejects(
    () => generateCoreResearchAnswer({
      requestId: "missing-source-usage",
      userQuery: "Fast research on Indian parliamentary accountability",
      mode: "fast_research",
      agendaContract: run.agendaContract,
      evidenceRegistry: run.evidenceRegistry,
      evidencePacks: run.evidencePacks,
      claimGraph: run.claimGraph,
      sourceUsageMaps: [],
      generationMode: "model",
    }),
    (error: any) => error?.code === "SOURCE_USAGE_MISSING",
  );
});
