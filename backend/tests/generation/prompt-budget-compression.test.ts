import test from "node:test";
import assert from "node:assert/strict";
import { buildCoreAnswerUserPrompt } from "../../src/core/generation/core-answer-prompt.js";
import { estimateTokens, getPromptBudget } from "../../src/core/generation/prompt-budget.js";
import { generateCoreResearchAnswer } from "../../src/core/generation/core-answer-generator.js";
import { FakeProviderRouter } from "../harness/fake-provider-router.js";
import { createFakeResearchRun } from "../harness/fake-evidence-registry.js";

function passingAnswer(run: ReturnType<typeof createFakeResearchRun>): string {
  const citations = run.evidenceRegistry.getCitationEligibleSources().slice(0, 40).map((source) => run.evidenceRegistry.getCitationMarkdown(source.id)).join(" ");
  const sourceBackedDetail = "Treasury Bench and Opposition analysis must connect every claim to verifiable source records, separate official evidence from media context, preserve constitutional nuance, include Indian parliamentary floor utility, and translate the evidence into POIs, rebuttals, motions, amendments, committee recommendations, and accountable ministry questions. ".repeat(18);
  return [
    "# Executive Thesis",
    `Treasury Bench and Opposition should frame this as constitutional challenge, Election Commission defence, Supreme Court doctrine, Union ministry accountability, public order, rights-based challenge, POIs, rebuttals, motions, amendments, committee recommendations, resolution clauses, central contradiction, and strategic synthesis. ${sourceBackedDetail} ${citations}`,
    "## Methodology and Source Base",
    `The answer uses registry citations and compressed evidence cards only. ${citations}`,
    "## Research Angle Map",
    "Treasury Bench, Opposition, courts, ministries, and Election Commission positions are separated.",
    "## Indian Mock Parliament Debate Utility Arsenal",
    `Treasury Bench arguments and Opposition arguments use source-grounded POIs and rebuttals. Motions, amendments, operative clause, and preambular clause language are included. ${citations}`,
    "## Final Strategic Synthesis",
    `Diagnosis: the central contradiction is proof versus rhetoric. Prescription: use source-backed floor pressure. Warning: do not overclaim. ${citations}`,
  ].join("\n\n");
}

test("budgeted final prompt uses compressed evidence cards and reports dropped sources", () => {
  const run = createFakeResearchRun(48, "fast_research");
  for (const source of run.evidenceRegistry.sources) {
    source.fullText = [
      `RAW_FULL_EXTRACTION_BLOCK_${source.id} `.repeat(300),
      `Useful paragraph ${source.id} about Election Commission defence, Supreme Court doctrine, and Opposition floor strategy.`,
    ].join("\n\n");
  }
  const budget = getPromptBudget({ providerName: "github", model: "openai/gpt-4.1", mode: "fast_research" });
  const { prompt, report } = buildCoreAnswerUserPrompt({
    requestId: "budget-compression",
    userQuery: run.agendaContract.originalUserQuery,
    mode: "fast_research",
    agendaContract: run.agendaContract,
    evidenceRegistry: run.evidenceRegistry,
    evidencePacks: run.evidencePacks,
    claimGraph: run.claimGraph,
    sourceUsageMaps: [],
    providerName: "github",
    model: "openai/gpt-4.1",
  }, budget);

  assert.doesNotMatch(prompt, /RAW_FULL_EXTRACTION_BLOCK_/);
  assert.ok(report.compressionApplied);
  assert.ok(report.droppedSourceIds.length > 0);
  assert.ok(Object.keys(report.droppedReason).length > 0);
  assert.equal(report.estimatedTokens, estimateTokens(prompt));
  assert.equal(report.providerMaxInputTokens, budget.maxInputTokens);
  assert.ok(report.includedSources <= budget.maxSourcesInPrompt);
});

test("fast_research model generation sends compressed prompt without request-too-large", async () => {
  const run = createFakeResearchRun(40, "fast_research");
  run.agendaContract.minimumUniqueCitedSources = 40;
  run.agendaContract.minimumEvidenceCardsPerModel = 40;
  for (const source of run.evidenceRegistry.sources) {
    source.fullText = [
      `RAW_FULL_EXTRACTION_BLOCK_${source.id} `.repeat(500),
      `Useful paragraph ${source.id} about Indian parliamentary accountability and constitutional scrutiny.`,
    ].join("\n\n");
  }
  const router = new FakeProviderRouter()
    .script("github", [{ type: "success", content: passingAnswer(run) }]);

  const result = await generateCoreResearchAnswer({
    requestId: "fast-compressed-generation",
    userQuery: run.agendaContract.originalUserQuery,
    mode: "fast_research",
    agendaContract: run.agendaContract,
    evidenceRegistry: run.evidenceRegistry,
    evidencePacks: run.evidencePacks,
    claimGraph: run.claimGraph,
    sourceUsageMaps: [],
    allowSyntheticSourceUsage: true,
    generationMode: "model",
    providerRouter: router as any,
    providerName: "github",
    model: "openai/gpt-4.1",
  });

  assert.equal(router.calls.length, 1);
  assert.ok(router.calls[0].estimatedTokens <= getPromptBudget({ providerName: "github", model: "openai/gpt-4.1", mode: "fast_research" }).maxInputTokens);
  assert.doesNotMatch(router.calls[0].request.messages.map((message) => message.content).join("\n"), /RAW_FULL_EXTRACTION_BLOCK_/);
  assert.equal(result.usedLegacyFallback, false);
});
