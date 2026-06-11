import test from "node:test";
import assert from "node:assert/strict";
import { buildCoreAnswerUserPrompt } from "../../src/core/generation/core-answer-prompt.js";
import { getPromptBudget } from "../../src/core/generation/prompt-budget.js";
import { createFakeResearchRun } from "../harness/fake-evidence-registry.js";

test("fast Groq final prompt preserves 20 selected source cards with labels and URLs", () => {
  const run = createFakeResearchRun(20, "fast_research");
  for (const source of run.evidenceRegistry.sources) {
    source.fullText = `${source.fullText}\n${"Long extract. ".repeat(250)}`;
  }
  const sourceIds = run.evidenceRegistry.getCitationEligibleSources().map((source) => source.id);
  const { prompt, report } = buildCoreAnswerUserPrompt({
    requestId: "source-feeding-20",
    userQuery: run.agendaContract.originalUserQuery,
    mode: "fast_research",
    agendaContract: run.agendaContract,
    evidenceRegistry: run.evidenceRegistry,
    evidencePacks: run.evidencePacks,
    claimGraph: run.claimGraph,
    sourceUsageMaps: [],
    providerName: "groq",
    model: "llama-3.3-70b-versatile",
    forceFinalSourceIds: sourceIds,
  }, getPromptBudget({ providerName: "groq", model: "llama-3.3-70b-versatile", mode: "fast_research" }));

  assert.equal(report.includedSources, 20);
  for (const sourceId of sourceIds) {
    assert.match(prompt, new RegExp(`\\[Source ${sourceId}\\]`));
    assert.match(prompt, new RegExp(`https://example\\.org/source-${sourceId}`));
  }
});
