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

test("provider status probes run concurrently with per-provider delays", async () => {
  const fetchFn = async (url: string) => {
    await new Promise((resolve) => setTimeout(resolve, 80));
    if (url.includes("openrouter")) {
      return new Response(JSON.stringify({ data: [{ id: "openai/gpt-4.1" }] }), { status: 200 }) as any;
    }
    return new Response(JSON.stringify({ data: [{ id: "moonshotai/kimi-k2.6" }] }), { status: 200 }) as any;
  };

  const started = Date.now();
  const payload = await buildProviderStatusPayload({
    ...emptyKeys,
    openrouterKey: "or-parallel-good",
    nvidiaKey: "nvapi-parallel-good",
  }, {
    fetchFn: fetchFn as any,
    now: 2_000,
    timeoutMs: 500,
  });
  const elapsed = Date.now() - started;

  assert.equal(payload.providers.openrouter.healthy, true);
  assert.equal(payload.providers.nvidia.healthy, true);
  assert.ok(elapsed < 170, `expected concurrent probes under 170ms, got ${elapsed}ms`);
});

test("provider status timeout can be configured from server environment", async () => {
  const previous = process.env.PROVIDER_STATUS_TIMEOUT_MS;
  process.env.PROVIDER_STATUS_TIMEOUT_MS = "25";
  try {
    const payload = await buildProviderStatusPayload({
      ...emptyKeys,
      nvidiaKey: "nvapi-slow-provider",
    }, {
      fetchFn: (async () => {
        await new Promise((resolve) => setTimeout(resolve, 80));
        return new Response(JSON.stringify({ data: [{ id: "moonshotai/kimi-k2.6" }] }), { status: 200 });
      }) as any,
      now: 9_000,
      cacheKey: "timeout-env-test",
      bypassCache: true,
    });

    assert.equal(payload.providers.nvidia.healthy, false);
    assert.equal(payload.providers.nvidia.status, "timeout");
    assert.match(payload.providers.nvidia.error ?? "", /timed out/i);
  } finally {
    if (previous === undefined) {
      delete process.env.PROVIDER_STATUS_TIMEOUT_MS;
    } else {
      process.env.PROVIDER_STATUS_TIMEOUT_MS = previous;
    }
  }
});
