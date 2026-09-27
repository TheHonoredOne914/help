import test from "node:test";
import assert from "node:assert/strict";
import { buildGenerationCandidates } from "../../src/core/generation/core-answer-generator.js";

test("generation fallback routes to OpenCode Zen free models first", () => {
  const candidates = buildGenerationCandidates({
    requestId: "opencode-fallback",
    userQuery: "How should India frame federalism and public order in a debate?",
    mode: "fast_research",
    agendaContract: { originalUserQuery: "How should India frame federalism and public order in a debate?" } as any,
    evidenceRegistry: { getCitationEligibleSources: () => [], getCitationEligibleCount: () => 0 } as any,
    evidencePacks: [],
    claimGraph: { claims: [] } as any,
    sourceUsageMaps: [],
    providerRouter: {
      hasProvider: (provider: string) => provider === "opencode" || provider === "groq",
      getRegisteredProviderNames: () => ["opencode", "groq"],
    } as any,
    providerName: "groq",
    model: "llama-3.3-70b-versatile",
    autoFallback: true,
    providerStatuses: [
      {
        providerName: "opencode",
        configured: true,
        healthy: true,
        status: "healthy",
        canChat: true,
        chatVerified: true,
        models: ["nemotron-3-ultra-free", "nemotron-3.5-lightning-free", "big-pickle"],
      },
      {
        providerName: "groq",
        configured: true,
        healthy: true,
        status: "healthy",
        canChat: true,
        chatVerified: true,
        models: ["llama-3.3-70b-versatile"],
      },
    ],
  });

  assert.ok(
    candidates.some((candidate) => candidate.providerName === "opencode" && candidate.model === "nemotron-3-ultra-free"),
    `expected OpenCode Zen fallback candidate, got ${candidates.map((candidate) => `${candidate.providerName}/${candidate.model}`).join(", ")}`,
  );
  assert.equal(
    candidates.some((candidate) => candidate.providerName === "cerebras"),
    false,
    "Cerebras must not appear in generation fallback candidates",
  );
});
