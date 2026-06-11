import test from "node:test";
import assert from "node:assert/strict";
import { fallbackModelsForMode } from "../../src/core/providers/model-strategy.js";
import { buildGenerationCandidates, generateCoreResearchAnswer } from "../../src/core/generation/core-answer-generator.js";
import { ProviderError } from "../../src/core/providers/provider-errors.js";
import { createFakeResearchRun } from "../harness/fake-evidence-registry.js";

const STALE_MODELS = /claude-3\.5-sonnet|claude-3-5-sonnet|gemini-1\.5-pro|gemini-1\.5-flash|kimi-k2\.6|nemotron-3-ultra-550b-a55b/;

test("provider fallback defaults never include stale OpenRouter Claude or Gemini 1.5 models", () => {
  for (const mode of ["fast_research", "deep_research", "deep_research", "council"] as const) {
    const ids = fallbackModelsForMode(mode).map((candidate) => `${candidate.providerName}/${candidate.model}`);
    assert.equal(ids.some((id) => STALE_MODELS.test(id)), false, `${mode}: ${ids.join(", ")}`);
  }
});

test("model generation without providerRouter throws a typed provider configuration error", async () => {
  const run = createFakeResearchRun(12, "fast_research");
  await assert.rejects(
    () => generateCoreResearchAnswer({
      requestId: "missing-router",
      userQuery: run.agendaContract.originalUserQuery,
      mode: "fast_research",
      agendaContract: run.agendaContract,
      evidenceRegistry: run.evidenceRegistry,
      evidencePacks: run.evidencePacks,
      claimGraph: run.claimGraph,
      sourceUsageMaps: [],
      allowSyntheticSourceUsage: true,
      generationMode: "model",
      providerName: "github",
      model: "openai/gpt-4.1",
    }),
    (error) => error instanceof ProviderError && (error as any).safeDetails?.code === "config_error",
  );
});

test("generation candidates skip stale models even if provider catalog still lists them", () => {
  const run = createFakeResearchRun(12, "fast_research");
  const candidates = buildGenerationCandidates({
    requestId: "stale-models",
    userQuery: run.agendaContract.originalUserQuery,
    mode: "fast_research",
    agendaContract: run.agendaContract,
    evidenceRegistry: run.evidenceRegistry,
    evidencePacks: run.evidencePacks,
    claimGraph: run.claimGraph,
    sourceUsageMaps: [],
    providerRouter: { hasProvider: () => true, getRegisteredProviderNames: () => ["openrouter", "gemini"] } as any,
    providerName: "openrouter",
    model: "anthropic/claude-3.5-sonnet-20241022",
    autoFallback: true,
    providerStatuses: [
      { providerName: "openrouter", configured: true, healthy: true, status: "healthy", canChat: true, chatVerified: true, models: ["anthropic/claude-3.5-sonnet-20241022", "meta-llama/llama-3.1-8b-instruct:free"] },
      { providerName: "gemini", configured: true, healthy: true, status: "healthy", canChat: true, chatVerified: true, models: ["gemini-1.5-pro", "gemini-2.5-flash"] },
    ],
  });

  assert.equal(candidates.some((candidate) => STALE_MODELS.test(candidate.model)), false);
  assert.ok(candidates.some((candidate) => candidate.providerName === "openrouter" && /:free$/.test(candidate.model)));
});
