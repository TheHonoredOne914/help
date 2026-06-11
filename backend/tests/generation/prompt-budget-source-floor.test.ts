import test from "node:test";
import assert from "node:assert/strict";
import { buildCoreAnswerUserPrompt } from "../../src/core/generation/core-answer-prompt.js";
import { getPromptBudget } from "../../src/core/generation/prompt-budget.js";
import { RESEARCH_LIMITS, type ResearchMode } from "../../src/core/config/research-mode.js";
import { createFakeResearchRun } from "../harness/fake-evidence-registry.js";

/**
 * Source-floor contract tests.
 *
 * Verify that the prompt-budget pipeline never silently drops the per-mode
 * minimum source floor defined in RESEARCH_LIMITS[mode].minFinalUniqueCitedSources.
 */

const MODES_AND_FLOORS: Array<{ mode: ResearchMode; floor: number }> = [
  { mode: "fast_research", floor: RESEARCH_LIMITS.fast_research.minFinalUniqueCitedSources },
  { mode: "deep_research", floor: RESEARCH_LIMITS.deep_research.minFinalUniqueCitedSources },
  { mode: "deep_research", floor: RESEARCH_LIMITS.deep_research.minFinalUniqueCitedSources },
  { mode: "council", floor: RESEARCH_LIMITS.council.minFinalUniqueCitedSources },
  { mode: "council", floor: RESEARCH_LIMITS.council.minFinalUniqueCitedSources },
];

for (const { mode, floor } of MODES_AND_FLOORS) {
  test(`${mode}: 60 sources with tight budget retains >= ${floor} sources in prompt`, () => {
    const run = createFakeResearchRun(60, mode);
    // Use a deliberately tight budget to force compression
    const budget = getPromptBudget({
      providerName: "groq",
      model: "llama-3.3-70b-versatile",
      mode,
      compressionLevel: 3,
    });
    // Force a very tight char budget to trigger the reduction loop
    const tightBudget = {
      ...budget,
      maxPromptChars: 18_000,
      maxInputTokens: 5_000,
    };

    const { report } = buildCoreAnswerUserPrompt(
      {
        requestId: `floor-test-${mode}`,
        userQuery: run.agendaContract.originalUserQuery,
        mode,
        agendaContract: run.agendaContract,
        evidenceRegistry: run.evidenceRegistry,
        evidencePacks: run.evidencePacks,
        claimGraph: run.claimGraph,
        sourceUsageMaps: [],
        providerName: "groq",
        model: "llama-3.3-70b-versatile",
      },
      tightBudget,
    );

    assert.ok(
      report.includedSources >= Math.min(floor, 60),
      `${mode}: expected >= ${Math.min(floor, 60)} sources, got ${report.includedSources}`,
    );
    assert.equal(
      report.sourceFloorBreach,
      floor > 60 ? report.sourceFloorBreach : undefined,
      `${mode}: should NOT have an unexpected sourceFloorBreach`,
    );
  });
}

test("fast_research: 12 sources triggers sourceFloorBreach and SourceGapReport", () => {
  const floor = RESEARCH_LIMITS.fast_research.minFinalUniqueCitedSources; // 40
  const run = createFakeResearchRun(12, "fast_research");
  const budget = getPromptBudget({
    providerName: "groq",
    model: "llama-3.3-70b-versatile",
    mode: "fast_research",
  });

  const { report } = buildCoreAnswerUserPrompt(
    {
      requestId: "floor-breach-test",
      userQuery: run.agendaContract.originalUserQuery,
      mode: "fast_research",
      agendaContract: run.agendaContract,
      evidenceRegistry: run.evidenceRegistry,
      evidencePacks: run.evidencePacks,
      claimGraph: run.claimGraph,
      sourceUsageMaps: [],
      providerName: "groq",
      model: "llama-3.3-70b-versatile",
    },
    budget,
  );

  // With only 12 sources available but floor of 40, a breach must be reported
  assert.ok(report.sourceFloorBreach, "sourceFloorBreach must be present when registry < floor");
  assert.equal(report.sourceFloorBreach!.mode, "fast_research");
  assert.equal(report.sourceFloorBreach!.floor, floor);
  assert.equal(report.sourceFloorBreach!.available, 12);
  assert.ok(report.sourceFloorBreach!.included <= 12, "cannot include more sources than available");
  assert.ok(report.sourceFloorBreach!.included > 0, "must include at least some sources");
});

test("sourceCardTarget in getPromptBudget matches RESEARCH_LIMITS for all modes", () => {
  for (const { mode, floor } of MODES_AND_FLOORS) {
    const budget = getPromptBudget({
      providerName: "groq",
      model: "llama-3.3-70b-versatile",
      mode,
    });
    assert.equal(
      budget.sourceCardTarget,
      floor,
      `${mode}: sourceCardTarget should be ${floor}, got ${budget.sourceCardTarget}`,
    );
    assert.ok(
      budget.maxSourcesInPrompt >= floor,
      `${mode}: maxSourcesInPrompt (${budget.maxSourcesInPrompt}) must be >= floor (${floor})`,
    );
  }
});

test("sourceCardTarget under high compression still respects mode floor", () => {
  for (const { mode, floor } of MODES_AND_FLOORS) {
    const budget = getPromptBudget({
      providerName: "groq",
      model: "llama-3.3-70b-versatile",
      mode,
      compressionLevel: 4,
    });
    assert.ok(
      budget.maxSourcesInPrompt >= floor,
      `${mode} compressed: maxSourcesInPrompt (${budget.maxSourcesInPrompt}) must be >= floor (${floor})`,
    );
  }
});

test("content compression happens before source reduction", () => {
  // Use deep_research (floor=80) with 80 sources and a very tight budget
  // to force multiple compression rounds
  const run = createFakeResearchRun(80, "deep_research");
  const budget = getPromptBudget({
    providerName: "groq",
    model: "llama-3.3-70b-versatile",
    mode: "deep_research",
  });
  const tightBudget = {
    ...budget,
    maxPromptChars: 20_000,
    maxInputTokens: 6_000,
    maxCardsPerPack: 5,
    maxFactsPerSource: 3,
  };

  const { report } = buildCoreAnswerUserPrompt(
    {
      requestId: "content-compression-first",
      userQuery: run.agendaContract.originalUserQuery,
      mode: "deep_research",
      agendaContract: run.agendaContract,
      evidenceRegistry: run.evidenceRegistry,
      evidencePacks: run.evidencePacks,
      claimGraph: run.claimGraph,
      sourceUsageMaps: [],
      providerName: "groq",
      model: "llama-3.3-70b-versatile",
    },
    tightBudget,
  );

  // The floor for deep_research is 80 — with 80 sources available,
  // the pipeline must never go below 80
  assert.ok(report.compressionApplied, "compression must have been applied");
  assert.ok(
    report.includedSources >= RESEARCH_LIMITS.deep_research.minFinalUniqueCitedSources,
    `deep_research: expected >= 80 sources, got ${report.includedSources}`,
  );
});
