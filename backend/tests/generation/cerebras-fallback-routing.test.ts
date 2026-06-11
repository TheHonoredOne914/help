import test from "node:test";
import assert from "node:assert/strict";
import { buildGenerationCandidates } from "../../src/core/generation/core-answer-generator.js";

test("generation fallback can route to Cerebras and prefers its high-context default model", () => {
  const candidates = buildGenerationCandidates({
    requestId: "cerebras-fallback",
    userQuery: "How should India frame federalism and public order in a debate?",
    mode: "fast_research",
    agendaContract: { originalUserQuery: "How should India frame federalism and public order in a debate?" } as any,
    evidenceRegistry: { getCitationEligibleSources: () => [], getCitationEligibleCount: () => 0 } as any,
    evidencePacks: [],
    claimGraph: { claims: [] } as any,
    sourceUsageMaps: [],
    providerRouter: {
      hasProvider: (provider: string) => provider === "cerebras",
      getRegisteredProviderNames: () => ["cerebras"],
    } as any,
    providerName: "groq",
    model: "llama-3.3-70b-versatile",
    autoFallback: true,
    providerStatuses: [
      {
        providerName: "cerebras",
        configured: true,
        healthy: true,
        status: "healthy",
        canChat: true,
        chatVerified: true,
        models: ["llama3.1-8b", "llama3.3-70b"],
      },
    ],
  });

  assert.ok(
    candidates.some((candidate) => candidate.providerName === "cerebras" && candidate.model === "llama3.3-70b"),
    `expected Cerebras fallback candidate, got ${candidates.map((candidate) => `${candidate.providerName}/${candidate.model}`).join(", ")}`,
  );
});
