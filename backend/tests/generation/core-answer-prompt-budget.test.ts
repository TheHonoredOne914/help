import test from "node:test";
import assert from "node:assert/strict";
import { buildCoreAnswerUserPrompt } from "../../src/core/generation/core-answer-prompt.js";
import { estimateTokens, getPromptBudget } from "../../src/core/generation/prompt-budget.js";
import type { ProviderName } from "../../src/core/providers/provider-types.js";
import type { ResearchMode } from "../../src/core/config/research-mode.js";
import { createFakeResearchRun } from "../harness/fake-evidence-registry.js";

test("25 sources and 11 packs for fast Groq stay under prompt budget", () => {
  const run = createFakeResearchRun(25, "fast_research");
  const budget = getPromptBudget({ providerName: "groq", model: "llama-3.3-70b-versatile", mode: "fast_research" });
  const { prompt, report } = buildCoreAnswerUserPrompt({
    requestId: "budget",
    userQuery: run.agendaContract.originalUserQuery,
    mode: "fast_research",
    agendaContract: run.agendaContract,
    evidenceRegistry: run.evidenceRegistry,
    evidencePacks: run.evidencePacks,
    claimGraph: run.claimGraph,
    sourceUsageMaps: [],
    providerName: "groq",
    model: "llama-3.3-70b-versatile",
  }, budget);

  assert.ok(estimateTokens(prompt) <= budget.maxInputTokens);
  assert.equal(report.compressionApplied, true);
  assert.ok(report.includedSources > 0);
  assert.ok(report.includedSources <= 25);
  assert.match(prompt, /\[Source 1\]/);
  assert.doesNotMatch(prompt, /EvidenceRegistry:[\s\S]*EvidencePacks:/);
});

test("provider prompt budgets reflect live safe input limits", () => {
  const groq = getPromptBudget({ providerName: "groq", model: "llama-3.3-70b-versatile", mode: "fast_research" });
  const groqGptOss = getPromptBudget({ providerName: "groq", model: "openai/gpt-oss-120b", mode: "fast_research" });
  const kimi = getPromptBudget({ providerName: "nvidia", model: "moonshotai/kimi-k2.6", mode: "fast_research" });
  const gemini = getPromptBudget({ providerName: "gemini", model: "gemini-2.5-pro", mode: "fast_research" });

  assert.ok(groq.maxInputTokens > groqGptOss.maxInputTokens);
  assert.ok(kimi.maxInputTokens < groq.maxInputTokens);
  assert.ok(gemini.maxInputTokens > groq.maxInputTokens);
});

test("Groq gpt-oss deep budget stays inside live TPM envelope", () => {
  const budget = getPromptBudget({ providerName: "groq", model: "openai/gpt-oss-120b", mode: "deep_research" });

  assert.ok(budget.maxInputTokens + budget.maxOutputTokens <= 7_500);
  assert.ok(budget.maxInputTokens <= 3_600);
  assert.ok(budget.maxOutputTokens <= 3_000);
});

test("provider prompt budgets preserve mode citation floors under compression", () => {
  const providers: Array<{ providerName: ProviderName; model: string }> = [
    { providerName: "groq", model: "llama-3.3-70b-versatile" },
    { providerName: "openrouter", model: "anthropic/claude-sonnet-4" },
    { providerName: "nvidia", model: "moonshotai/kimi-k2.6" },
    { providerName: "gemini", model: "gemini-2.5-pro" },
    { providerName: "github", model: "openai/gpt-4.1" },
  ];
  const modes: Array<{ mode: ResearchMode; target: number }> = [
    { mode: "fast_research", target: 40 },
    { mode: "deep_research", target: 80 },
    { mode: "deep_research", target: 30 },
    { mode: "council", target: 30 },
    { mode: "council", target: 180 },
  ];

  for (const provider of providers) {
    for (const { mode, target } of modes) {
      const budget = getPromptBudget({ ...provider, mode, compressionLevel: 4 });
      assert.equal(budget.sourceCardTarget, target, `${provider.providerName} ${mode} target`);
      assert.equal(budget.targetUniqueCitations, target, `${provider.providerName} ${mode} citations`);
      assert.ok(budget.maxSourcesInPrompt >= target, `${provider.providerName} ${mode} source prompt cap`);
    }
  }
});
