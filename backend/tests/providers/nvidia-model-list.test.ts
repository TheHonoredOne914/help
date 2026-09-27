import test from "node:test";
import assert from "node:assert/strict";
import { buildPrefixedModelId, listNvidiaModels, normalizeNvidiaModels, NVIDIA_CATALOG } from "../../src/routes/providers.js";

test("NVIDIA fallback catalog excludes stale Kimi K2.6", () => {
  assert.equal(NVIDIA_CATALOG.some((model) => model.id === "moonshotai/kimi-k2.6"), false);
  assert.equal(buildPrefixedModelId("nvidia", "meta/llama-3.1-8b-instruct"), "nvidia/meta/llama-3.1-8b-instruct");
});

test("NVIDIA live model data normalizes Nemotron Super", () => {
  const models = normalizeNvidiaModels({
    data: [
      { id: "moonshotai/kimi-k2.6", owned_by: "moonshotai" },
      { id: "nvidia/llama-3.3-nemotron-super-49b-v1", context_length: 131072 },
    ],
  });
  assert.ok(models.some((model) => model.id.includes("nemotron-super")));
});

test("NVIDIA model list falls back to curated catalog when live fetch fails", async () => {
  const payload = await listNvidiaModels("nvapi-test", async () => new Response("nope", { status: 500 }) as any);
  assert.equal(payload.source, "catalog_fallback");
  assert.equal(payload.models.some((model) => /kimi-k2\.6/i.test(model.id)), false);
  assert.ok(payload.models.some((model) => model.id.includes("nemotron-super")));
});

test("NVIDIA model list drops stale kimi-k2.6 from live results", async () => {
  const payload = await listNvidiaModels("nvapi-test", async () => new Response(JSON.stringify({ data: [{ id: "moonshotai/kimi-k2.6" }, { id: "nvidia/llama-3.3-nemotron-super-49b-v1" }] }), { status: 200 }) as any);
  assert.equal(payload.source, "live");
  assert.equal(payload.models.some((model) => /kimi-k2\.6/i.test(model.id)), false);
  assert.ok(payload.models.some((model) => model.id.includes("nemotron-super")));
});
