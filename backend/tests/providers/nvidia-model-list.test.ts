import test from "node:test";
import assert from "node:assert/strict";
import { buildPrefixedModelId, listNvidiaModels, normalizeNvidiaModels, NVIDIA_CATALOG } from "../../src/routes/providers.js";

test("NVIDIA fallback catalog includes Kimi K2.6", () => {
  assert.ok(NVIDIA_CATALOG.some((model) => model.id === "moonshotai/kimi-k2.6"));
  assert.equal(buildPrefixedModelId("nvidia", "moonshotai/kimi-k2.6"), "nvidia/moonshotai/kimi-k2.6");
});

test("NVIDIA live model data normalizes and keeps Kimi/Nemotron", () => {
  const models = normalizeNvidiaModels({
    data: [
      { id: "moonshotai/kimi-k2.6", owned_by: "moonshotai" },
      { id: "nvidia/llama-3.3-nemotron-super-49b-v1", context_length: 131072 },
    ],
  });
  assert.ok(models.some((model) => model.id === "moonshotai/kimi-k2.6" && model.name === "Kimi K2.6"));
  assert.ok(models.some((model) => model.id.includes("nemotron-super")));
});

test("NVIDIA model list falls back to curated catalog when live fetch fails", async () => {
  const payload = await listNvidiaModels("nvapi-test", async () => new Response("nope", { status: 500 }) as any);
  assert.equal(payload.source, "catalog_fallback");
  assert.ok(payload.models.some((model) => model.id === "moonshotai/kimi-k2.6"));
});

test("NVIDIA model list returns live source when endpoint succeeds", async () => {
  const payload = await listNvidiaModels("nvapi-test", async () => new Response(JSON.stringify({ data: [{ id: "moonshotai/kimi-k2.6" }] }), { status: 200 }) as any);
  assert.equal(payload.source, "live");
  assert.ok(payload.models.some((model) => model.id === "moonshotai/kimi-k2.6"));
});
