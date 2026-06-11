import test from "node:test";
import assert from "node:assert/strict";
import { buildGenerationCandidates } from "../../src/core/generation/core-answer-generator.js";
import { createProviderRunState } from "../../src/core/providers/provider-run-state.js";
import type { ProviderName } from "../../src/core/providers/provider-types.js";
import { createFakeResearchRun } from "../harness/fake-evidence-registry.js";

class RouterWithProviders {
  constructor(private readonly providers: ProviderName[]) {}
  getRegisteredProviderNames(): ProviderName[] {
    return this.providers;
  }
  hasProvider(provider: ProviderName): boolean {
    return this.providers.includes(provider);
  }
}

function input(overrides: Record<string, unknown> = {}) {
  const run = createFakeResearchRun(12, "fast_research");
  return {
    requestId: "openrouter-routing",
    userQuery: run.agendaContract.originalUserQuery,
    mode: "fast_research" as const,
    agendaContract: run.agendaContract,
    evidenceRegistry: run.evidenceRegistry,
    evidencePacks: run.evidencePacks,
    claimGraph: run.claimGraph,
    sourceUsageMaps: [],
    providerRouter: new RouterWithProviders(["github", "openrouter"]) as any,
    providerName: "github" as const,
    model: "openai/gpt-4.1",
    autoFallback: true,
    providerStatuses: [
      { providerName: "github" as const, configured: true, healthy: true, status: "healthy" as const, canChat: true, chatVerified: true, models: ["openai/gpt-4.1"] },
      {
        providerName: "openrouter" as const,
        configured: true,
        healthy: true,
        status: "healthy" as const,
        canChat: true,
        chatVerified: true,
        models: [
          "anthropic/claude-3.5-sonnet-20241022",
          "meta-llama/llama-3.1-8b-instruct:free",
          "openai/gpt-4o-mini",
        ],
      },
    ],
    ...overrides,
  };
}

test("OpenRouter fallback prefers a healthy free model from the live catalog", () => {
  const candidates = buildGenerationCandidates(input());
  const openrouter = candidates.find((candidate) => candidate.providerName === "openrouter");

  assert.equal(openrouter?.model, "meta-llama/llama-3.1-8b-instruct:free");
  assert.equal(candidates.some((candidate) => /claude-3\.5-sonnet/.test(candidate.model)), false);
});

test("user-selected healthy free OpenRouter model stays first", () => {
  const candidates = buildGenerationCandidates(input({
    providerRouter: new RouterWithProviders(["openrouter", "github"]) as any,
    providerName: "openrouter",
    model: "deepseek/deepseek-r1:free",
    autoFallback: false,
    providerStatuses: [
      {
        providerName: "openrouter",
        configured: true,
        healthy: true,
        status: "healthy",
        canChat: true,
        chatVerified: true,
        models: ["deepseek/deepseek-r1:free", "openai/gpt-4o-mini"],
      },
      { providerName: "github", configured: true, healthy: true, status: "healthy", canChat: true, chatVerified: true, models: ["openai/gpt-4.1"] },
    ],
  }));

  assert.deepEqual(candidates[0], { providerName: "openrouter", model: "deepseek/deepseek-r1:free" });
});

test("OpenRouter 404 invalidates only the exact model for the current run", () => {
  const state = createProviderRunState(() => 1_000);
  state.recordFailure("openrouter", { code: "invalid_model", status: 404 }, { model: "anthropic/claude-3.5-sonnet-20241022" });

  assert.equal(state.isModelInvalid("openrouter", "anthropic/claude-3.5-sonnet-20241022"), true);
  assert.equal(state.isModelInvalid("openrouter", "openai/gpt-4o-mini"), false);
});
