import test from "node:test";
import assert from "node:assert/strict";

import { runResearchPipeline } from "../../src/core/pipeline/research-pipeline.js";
import { fakePreloadedSources } from "./harness/fake-runtime.js";

test("functional harness produces an honest terminal status and normalized agenda", async () => {
  const result = await runResearchPipeline({
    requestId: "functional-harness",
    runId: "functional-harness-run",
    conversationId: "c1",
    assistantMessageId: "m1",
    userQuery: "   DPDP Act   privacy safeguards   India   ",
    mode: "fast_research",
    preloadedSources: fakePreloadedSources(8),
    liveRetrieval: false,
    useCoreGeneration: false,
    generationMode: "deterministic",
    allowSyntheticSourceUsage: true,
    legacyFallback: async ({ evidenceRegistry }) => {
      const cited = evidenceRegistry.getCitationEligibleSources().slice(0, 3);
      return cited
        .map((source) => `DPDP privacy safeguards need proportionality review [Source ${source.id}](${source.url}).`)
        .join("\n");
    },
  });

  assert.equal(result.agendaContract.normalizedAgenda, "DPDP Act privacy safeguards India");
  assert.notEqual(result.terminalStatus, "completed");
  assert.notEqual(result.terminalStatus, "degraded_fallback");
  assert.ok(["legacy_fallback_used", "completed_with_source_gaps", "failed"].includes(result.terminalStatus));
  assert.ok(result.sourceGapReport);
});
