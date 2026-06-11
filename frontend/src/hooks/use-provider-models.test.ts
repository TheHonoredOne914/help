import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHealthyResearchModels,
  deriveStatusFromModelRoute,
  repairSelectedModel,
  type ProviderRuntimeStatusCore,
} from "./use-provider-models-core";

const baseStatus: ProviderRuntimeStatusCore = {
  provider: "groq",
  configured: true,
  healthy: false,
  checking: false,
  status: "catalog_fallback",
  source: "catalog_fallback",
  modelCount: 1,
  canChat: false,
  canListModels: true,
};

test("catalog_fallback with models stays display-only and does not become healthy", () => {
  const status = deriveStatusFromModelRoute("groq", baseStatus, [{ id: "llama-3.3-70b-versatile" }]);

  assert.equal(status.healthy, false);
  assert.equal(status.status, "catalog_fallback");
  assert.equal(status.availableForDisplay, true);
  assert.equal(status.availableForResearch, true);
});

test("network_error with returned models stays unavailable for research", () => {
  const status = deriveStatusFromModelRoute("openrouter", {
    ...baseStatus,
    provider: "openrouter",
    status: "network_error",
    source: "catalog_fallback",
  }, [{ id: "anthropic/claude-3.5-sonnet" }]);

  assert.equal(status.healthy, false);
  assert.equal(status.availableForDisplay, true);
  assert.equal(status.availableForResearch, true);
});

test("healthy live model route is selectable for research", () => {
  const status = deriveStatusFromModelRoute("nvidia", {
    ...baseStatus,
    provider: "nvidia",
    healthy: true,
    status: "healthy",
    source: "live",
    canChat: true,
  }, [{ id: "moonshotai/kimi-k2.6" }]);

  assert.equal(status.healthy, true);
  assert.equal(status.availableForResearch, true);
});

test("catalog models can display and stay selectable for explicit user choice", () => {
  const statuses = {
    groq: deriveStatusFromModelRoute("groq", baseStatus, [{ id: "llama-3.3-70b-versatile" }]),
    gemini: deriveStatusFromModelRoute("gemini", { ...baseStatus, provider: "gemini", healthy: true, status: "healthy", canChat: true }, [{ id: "gemini-2.5-pro" }]),
    cerebras: deriveStatusFromModelRoute("cerebras", { ...baseStatus, provider: "cerebras", healthy: true, status: "healthy", canChat: true }, [{ id: "llama3.3-70b" }]),
    nvidia: { ...baseStatus, provider: "nvidia" },
    openrouter: { ...baseStatus, provider: "openrouter" },
    github: { ...baseStatus, provider: "github" },
    ollama: { ...baseStatus, provider: "ollama" },
    tavily: { ...baseStatus, provider: "tavily" },
    jina: { ...baseStatus, provider: "jina" },
    brave: { ...baseStatus, provider: "brave" },
    serper: { ...baseStatus, provider: "serper" },
  } as any;
  const models = {
    groq: [{ id: "llama-3.3-70b-versatile" }],
    gemini: [{ id: "gemini-2.5-pro" }],
    cerebras: [{ id: "llama3.3-70b" }],
    nvidia: [],
    openrouter: [],
    github: [],
    ollama: [],
  };

  assert.deepEqual(buildHealthyResearchModels(statuses, models), ["groq/llama-3.3-70b-versatile", "gemini/gemini-2.5-pro", "cerebras/llama3.3-70b"]);
});

test("stale selected model repairs only to a research-usable model", () => {
  const healthy = ["nvidia/moonshotai/kimi-k2.6", "gemini/gemini-2.5-pro"];
  assert.equal(repairSelectedModel("groq/llama-3.3-70b-versatile", healthy), "nvidia/moonshotai/kimi-k2.6");
  assert.equal(repairSelectedModel("gemini/gemini-2.5-pro", healthy), "gemini/gemini-2.5-pro");
  assert.equal(repairSelectedModel("groq/llama-3.3-70b-versatile", []), null);
});
