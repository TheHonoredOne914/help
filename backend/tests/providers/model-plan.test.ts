import test from "node:test";
import assert from "node:assert/strict";
import {
  buildResearchModelPlan,
  getResearchModelAssignment,
} from "../../src/core/providers/model-strategy.js";
import type { ProviderResearchStatus } from "../../src/core/providers/provider-health.js";

const healthyStatuses: ProviderResearchStatus[] = [
  { providerName: "gemini", configured: true, status: "healthy", healthy: true, canChat: true, chatVerified: true, models: ["gemini-2.5-pro"] },
  { providerName: "nvidia", configured: true, status: "healthy", healthy: true, canChat: true, chatVerified: true, models: ["nvidia/llama-3.3-nemotron-super-49b-v1"] },
  { providerName: "github", configured: true, status: "healthy", healthy: true, canChat: true, chatVerified: true, models: ["openai/gpt-4.1"] },
  { providerName: "openrouter", configured: true, status: "healthy", healthy: true, canChat: true, chatVerified: true, models: ["anthropic/claude-sonnet-4.5"] },
  { providerName: "groq", configured: true, status: "healthy", healthy: true, canChat: true, chatVerified: true, models: ["llama-3.3-70b-versatile"] },
];

test("ResearchModelPlan maps five explicit selected models to role assignments without stripping nested org names", () => {
  const plan = buildResearchModelPlan({
    runId: "run-model-plan",
    mode: "deep_research",
    userSelectedModels: [
      "gemini/gemini-2.5-pro",
      "nvidia/nvidia/llama-3.3-nemotron-super-49b-v1",
      "github/openai/gpt-4.1",
      "openrouter/anthropic/claude-sonnet-4.5",
      "groq/llama-3.3-70b-versatile",
    ],
    providerStatuses: healthyStatuses,
    autoFallback: false,
    validatedAt: "2026-05-26T00:00:00.000Z",
  });

  assert.equal(plan.assignments.length >= 5, true);
  assert.equal(getResearchModelAssignment(plan, "retrieval_critic")?.providerName, "gemini");
  assert.equal(getResearchModelAssignment(plan, "retrieval_critic")?.model, "gemini-2.5-pro");
  assert.equal(getResearchModelAssignment(plan, "evidence_extractor")?.providerName, "nvidia");
  assert.equal(getResearchModelAssignment(plan, "evidence_extractor")?.model, "nvidia/llama-3.3-nemotron-super-49b-v1");
  assert.equal(getResearchModelAssignment(plan, "thesis_synthesizer")?.model, "openai/gpt-4.1");
  assert.equal(getResearchModelAssignment(plan, "citation_auditor")?.model, "anthropic/claude-sonnet-4.5");
  assert.equal(getResearchModelAssignment(plan, "indian_parliamentary_strategist")?.model, "llama-3.3-70b-versatile");
  assert.equal(getResearchModelAssignment(plan, "evidence_extractor")?.selectionSource, "user_explicit");
  assert.equal(getResearchModelAssignment(plan, "evidence_extractor")?.fallbackPolicy, "locked");
});

test("ResearchModelPlan marks catalog fallback providers as not generation eligible", () => {
  const plan = buildResearchModelPlan({
    runId: "run-catalog-only",
    mode: "deep_research",
    userSelectedModels: ["openrouter/qwen/qwen3-32b:free"],
    providerStatuses: [
      {
        providerName: "openrouter",
        configured: true,
        status: "catalog_fallback",
        healthy: false,
        canChat: false,
        chatVerified: false,
        catalogFallbackOnly: true,
        models: ["qwen/qwen3-32b:free"],
      },
    ],
    autoFallback: false,
    validatedAt: "2026-05-26T00:00:00.000Z",
  });

  const assignment = getResearchModelAssignment(plan, "retrieval_critic");
  assert.equal(assignment?.providerName, "openrouter");
  assert.equal(assignment?.model, "qwen/qwen3-32b:free");
  assert.equal(assignment?.selectionSource, "user_explicit");
  assert.equal(assignment?.generationEligible, false);
  assert.match(assignment?.blockedReason ?? "", /catalog/i);
  assert.deepEqual(plan.generationEligibleAssignments, []);
});
