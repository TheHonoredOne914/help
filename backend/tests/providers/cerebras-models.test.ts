import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProviderStatusPayload,
  listCerebrasModels,
  CEREBRAS_MODELS_CATALOG,
} from "../../src/routes/providers.js";
import { buildCoreProviderRouter } from "../../src/services/anthropic-service.js";

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
  cerebrasKey: null,
  openaiKey: null,
};

test("Cerebras live model list is honest when the endpoint succeeds", async () => {
  const payload = await listCerebrasModels("csk-live", async () => new Response(JSON.stringify({
    data: [
      { id: "llama3.3-70b", name: "Llama 3.3 70B" },
      { id: "llama3.1-8b", name: "Llama 3.1 8B" },
    ],
  }), { status: 200, headers: { "content-type": "application/json" } }) as any);

  assert.equal(payload.provider, "cerebras");
  assert.equal(payload.status, "healthy");
  assert.equal(payload.healthy, true);
  assert.ok(payload.models.some((model) => model.id === "llama3.3-70b"));
});

test("Cerebras catalog fallback does not fake healthy status", async () => {
  const payload = await listCerebrasModels("csk-fallback", async () => new Response("server unavailable", { status: 503 }) as any);

  assert.equal(payload.provider, "cerebras");
  assert.equal(payload.source, "catalog_fallback");
  assert.equal(payload.healthy, false);
  assert.equal(payload.status, "catalog_fallback");
  assert.ok(payload.models.some((model) => model.id === "llama3.3-70b"));
  assert.deepEqual(
    payload.models.map((model) => model.id),
    [...new Set(payload.models.map((model) => model.id))],
    "catalog models should be deduplicated",
  );
});

test("Provider status payload includes Cerebras as an explicit provider", async () => {
  const payload = await buildProviderStatusPayload({
    ...emptyKeys,
    cerebrasKey: "csk-status",
  }, {
    now: 1,
    fetchFn: async (input) => {
      if (typeof input === "string" && input.includes("api.cerebras.ai")) {
        return new Response(JSON.stringify({ data: [{ id: "llama3.3-70b" }] }), { status: 200, headers: { "content-type": "application/json" } }) as any;
      }
      throw new Error(`unexpected fetch: ${String(input)}`);
    },
  });

  assert.equal(payload.providers.cerebras.configured, true);
  assert.equal(payload.providers.cerebras.status, "healthy");
  assert.equal(payload.providers.cerebras.healthy, true);
  assert.ok(payload.providers.cerebras.models?.includes("llama3.3-70b"));
});

test("Cerebras catalog contains the expected shipped models", () => {
  const ids = CEREBRAS_MODELS_CATALOG.map((model) => model.id);
  assert.ok(ids.includes("llama3.3-70b"));
  assert.ok(ids.includes("llama3.1-8b"));
});

test("Core provider router accepts Cerebras model IDs and keeps the provider registered", () => {
  const result = buildCoreProviderRouter({
    ...emptyKeys,
    cerebrasKey: "csk-router",
  }, "cerebras/llama3.3-70b");

  assert.equal(result.providerName, "cerebras");
  assert.equal(result.model, "llama3.3-70b");
  assert.equal(result.error, undefined);
  assert.equal(result.router?.hasProvider("cerebras"), true);
});
