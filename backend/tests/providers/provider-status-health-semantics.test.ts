import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProviderStatusPayload,
  httpStatusForProviderStatus,
  listGithubModels,
  listNvidiaModels,
  GROQ_CATALOG,
  OPENROUTER_CATALOG,
  OLLAMA_CATALOG,
  NVIDIA_CATALOG,
  GITHUB_MODELS_CATALOG,
} from "../../src/routes/providers.js";

const emptyKeys = {
  groqKey: null,
  ollamaKey: null,
  ollamaBase: null,
  nvidiaKey: null,
  geminiKey: null,
  openrouterKey: null,
  githubToken: null,
  tavilyKey: null,
  serperKey: null,
  braveKey: null,
  jinaKey: null,
  hfToken: null,
};

test("NVIDIA catalog fallback does not fake a healthy provider", async () => {
  const payload = await listNvidiaModels("nvapi-fallback", async () => new Response("server unavailable", { status: 503 }) as any);

  assert.equal(payload.source, "catalog_fallback");
  assert.equal(payload.healthy, false);
  assert.equal(payload.status, "catalog_fallback");
  assert.ok(payload.models.some((model) => model.id === "moonshotai/kimi-k2.6"));
});

test("invalid NVIDIA key is not healthy and redacts provider errors", async () => {
  const payload = await buildProviderStatusPayload({
    ...emptyKeys,
    nvidiaKey: "nvapi-secret-invalid",
  }, {
    fetchFn: async () => new Response("invalid nvapi-secret-invalid", { status: 401 }) as any,
    now: 3_000,
  });

  assert.equal(payload.providers.nvidia.configured, true);
  assert.equal(payload.providers.nvidia.healthy, false);
  assert.equal(payload.providers.nvidia.status, "invalid_key");
  assert.doesNotMatch(JSON.stringify(payload), /nvapi-secret-invalid/);
});

test("GitHub catalog is shown even when token validation fails", async () => {
  const payload = await listGithubModels("gh-invalid-token", async () => new Response("unauthorized", { status: 401 }) as any);

  assert.equal(payload.provider, "github");
  assert.equal(payload.source, "catalog_fallback");
  assert.equal(payload.healthy, false);
  assert.equal(payload.status, "catalog_fallback");
  assert.ok(payload.models.length > 0, "show catalog so a valid chat key still works");
});

test("model list routes expose honest HTTP status codes for provider states", () => {
  assert.equal(httpStatusForProviderStatus("healthy"), 200);
  assert.equal(httpStatusForProviderStatus("checking"), 202);
  assert.equal(httpStatusForProviderStatus("missing_key"), 401);
  assert.equal(httpStatusForProviderStatus("invalid_key"), 401);
  assert.equal(httpStatusForProviderStatus("rate_limited"), 429);
  assert.equal(httpStatusForProviderStatus("catalog_fallback"), 206);
  assert.equal(httpStatusForProviderStatus("unverified"), 206);
  assert.equal(httpStatusForProviderStatus("network_error"), 502);
  assert.equal(httpStatusForProviderStatus("unavailable"), 503);
});

test("Groq fallback catalog does not fake a healthy provider", async () => {
  const payload = await listNvidiaModels("nvapi-fallback", async () => new Response("server unavailable", { status: 503 }) as any);

  assert.equal(payload.source, "catalog_fallback");
  assert.equal(payload.healthy, false);
  assert.ok(payload.models.length > 0, "catalog_fallback must return models");
  assert.notEqual(payload.status, "healthy", "catalog_fallback must never be healthy");
});

test("catalog_fallback status is never healthy for any provider", () => {
  const catalogs = {
    groq: GROQ_CATALOG,
    openrouter: OPENROUTER_CATALOG,
    ollama: OLLAMA_CATALOG,
    nvidia: NVIDIA_CATALOG,
    github: GITHUB_MODELS_CATALOG,
  };

  for (const [provider, catalog] of Object.entries(catalogs)) {
    assert.ok(catalog.length > 0, `${provider} catalog must have models`);
    assert.ok(
      catalog.every((m) => m.id && m.id.trim()),
      `${provider} catalog models must all have non-empty IDs`
    );
  }
});

test("catalog_fallback models are display-only and do not imply key validity", () => {
  const catalogs = {
    groq: GROQ_CATALOG,
    openrouter: OPENROUTER_CATALOG,
    ollama: OLLAMA_CATALOG,
    nvidia: NVIDIA_CATALOG,
    github: GITHUB_MODELS_CATALOG,
  };

  for (const [provider, catalog] of Object.entries(catalogs)) {
    const modelIds = catalog.map((m) => m.id);
    assert.ok(
      new Set(modelIds).size === modelIds.length,
      `${provider} catalog must not have duplicate model IDs`
    );
  }
});

test("Groq catalog contains expected stable models", () => {
  const groqIds = GROQ_CATALOG.map((m) => m.id);
  assert.ok(groqIds.includes("llama-3.3-70b-versatile"), "Groq catalog must include llama-3.3-70b-versatile");
  assert.ok(groqIds.includes("llama-3.1-8b-instant"), "Groq catalog must include llama-3.1-8b-instant");
  assert.ok(groqIds.includes("openai/gpt-oss-120b"), "Groq catalog must include openai/gpt-oss-120b");
  assert.ok(groqIds.includes("openai/gpt-oss-20b"), "Groq catalog must include openai/gpt-oss-20b");
  assert.ok(groqIds.includes("qwen/qwen3-32b"), "Groq catalog must include qwen/qwen3-32b");

  assert.ok(!groqIds.includes("llama3-70b-8192"), "Groq catalog must NOT include deprecated llama3-70b-8192");
  assert.ok(!groqIds.includes("llama3-8b-8192"), "Groq catalog must NOT include deprecated llama3-8b-8192");
  assert.ok(!groqIds.includes("gemma2-9b-it"), "Groq catalog must NOT include deprecated gemma2-9b-it");
});

test("NVIDIA catalog includes kimi-k2 as preferred model", () => {
  const nvidiaIds = NVIDIA_CATALOG.map((m) => m.id);
  assert.ok(nvidiaIds.includes("moonshotai/kimi-k2.6"), "NVIDIA catalog must include kimi-k2.6");
});

test("GitHub catalog includes expected models", () => {
  const githubIds = GITHUB_MODELS_CATALOG.map((m) => m.id);
  assert.ok(githubIds.includes("openai/gpt-4.1"), "GitHub catalog must include gpt-4.1");
  assert.ok(githubIds.includes("openai/gpt-4o"), "GitHub catalog must include gpt-4o");
  assert.ok(githubIds.includes("meta/llama-3.3-70b-instruct"), "GitHub catalog must include llama-3.3-70b-instruct");
});

test("OpenRouter catalog includes multi-provider models", () => {
  const orIds = OPENROUTER_CATALOG.map((m) => m.id);
  assert.ok(orIds.some((id) => id.startsWith("openai/")), "OpenRouter catalog must include OpenAI models");
  assert.ok(orIds.some((id) => id.startsWith("anthropic/")), "OpenRouter catalog must include Anthropic models");
  assert.ok(orIds.some((id) => id.startsWith("google/")), "OpenRouter catalog must include Google models");
});

test("Ollama catalog includes common local models", () => {
  const ollamaIds = OLLAMA_CATALOG.map((m) => m.id);
  assert.ok(ollamaIds.includes("llama3.3"), "Ollama catalog must include llama3.3");
  assert.ok(ollamaIds.includes("mistral"), "Ollama catalog must include mistral");
  assert.ok(ollamaIds.includes("qwen2.5"), "Ollama catalog must include qwen2.5");
});
