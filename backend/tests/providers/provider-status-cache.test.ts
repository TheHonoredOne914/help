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

test("provider status cache invalidates when a configured key value changes", async () => {
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    if (calls === 1) return new Response("unauthorized", { status: 401 }) as any;
    return new Response(JSON.stringify({ data: [{ id: "moonshotai/kimi-k2.6" }] }), { status: 200 }) as any;
  };

  const first = await buildProviderStatusPayload({ ...emptyKeys, nvidiaKey: "nvapi-cache-bad-a" }, { fetchFn, now: 1_000 });
  const second = await buildProviderStatusPayload({ ...emptyKeys, nvidiaKey: "nvapi-cache-good-b" }, { fetchFn, now: 1_100 });

  assert.equal(first.providers.nvidia.healthy, false);
  assert.equal(second.providers.nvidia.healthy, true);
  assert.equal(calls, 2);
});

