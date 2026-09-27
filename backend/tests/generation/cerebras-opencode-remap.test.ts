import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGenerationCandidates,
  remapCerebrasProviderSelection,
} from "../../src/core/generation/core-answer-generator.js";
import { buildResearchModelPlan } from "../../src/core/providers/model-strategy.js";
import { OPENCODE_ZEN_STRONG_MODEL } from "../../src/core/providers/opencode-zen-provider.js";

test("remapCerebrasProviderSelection remaps cerebras to opencode free model", () => {
  assert.deepEqual(
    remapCerebrasProviderSelection("cerebras", "llama3.3-70b"),
    { providerName: "opencode", model: OPENCODE_ZEN_STRONG_MODEL },
  );
  assert.deepEqual(
    remapCerebrasProviderSelection("groq", "llama-3.3-70b-versatile"),
    { providerName: "groq", model: "llama-3.3-70b-versatile" },
  );
});

test("selecting cerebras remaps to opencode in generation candidates", () => {
  const candidates = buildGenerationCandidates({
    requestId: "cerebras-remap",
    userQuery: "How should India frame federalism and public order in a debate?",
    mode: "fast_research",
    agendaContract: { originalUserQuery: "federalism" } as any,
    evidenceRegistry: { getCitationEligibleSources: () => [], getCitationEligibleCount: () => 0 } as any,
    evidencePacks: [],
    claimGraph: { claims: [] } as any,
    sourceUsageMaps: [],
    providerRouter: {
      hasProvider: (provider: string) => provider === "opencode" || provider === "cerebras" || provider === "groq",
      getRegisteredProviderNames: () => ["opencode", "cerebras", "groq"],
    } as any,
    providerName: "cerebras",
    model: "llama3.3-70b",
    autoFallback: true,
    trustRegisteredProvidersWithoutStatus: true,
    providerStatuses: [
      {
        providerName: "opencode",
        configured: true,
        healthy: true,
        status: "healthy",
        canChat: true,
        chatVerified: true,
        models: ["nemotron-3-ultra-free", "nemotron-3.5-lightning-free"],
      },
      {
        providerName: "cerebras",
        configured: true,
        healthy: true,
        status: "healthy",
        canChat: true,
        chatVerified: true,
        models: ["llama3.3-70b"],
      },
    ],
  });

  assert.equal(candidates[0]?.providerName, "opencode");
  assert.equal(candidates[0]?.model, "nemotron-3-ultra-free");
  assert.equal(
    candidates.some((candidate) => candidate.providerName === "cerebras"),
    false,
    "cerebras must not remain as a generation candidate destination",
  );
});

test("research model plan remaps explicit cerebras selection to opencode", () => {
  const plan = buildResearchModelPlan({
    runId: "plan-cerebras",
    mode: "fast_research",
    userSelectedModels: ["cerebras/llama3.3-70b"],
    autoFallback: true,
    providerStatuses: [
      {
        providerName: "opencode",
        configured: true,
        healthy: true,
        status: "healthy",
        canChat: true,
        chatVerified: true,
        models: ["nemotron-3-ultra-free"],
      },
    ],
  });

  assert.ok(plan.assignments.length > 0);
  assert.equal(plan.assignments[0]?.providerName, "opencode");
  assert.equal(plan.assignments[0]?.model, "nemotron-3-ultra-free");
});
