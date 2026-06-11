import test from "node:test";
import assert from "node:assert/strict";
import { buildProviderStatusPayload } from "../../src/routes/providers.js";

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

test("Gemini live status reports live source, not catalog fallback", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    object: "list",
    data: [{ id: "gemini-2.5-pro", object: "model" }],
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    const payload = await buildProviderStatusPayload({
      ...emptyKeys,
      geminiKey: "gemini-live-key",
    }, { now: 20_000, bypassCache: true });

    assert.equal(payload.providers.gemini.healthy, true);
    assert.equal(payload.providers.gemini.status, "healthy");
    assert.equal(payload.providers.gemini.source, "live");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
