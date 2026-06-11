import test from "node:test";
import assert from "node:assert/strict";
import { extractKeys } from "../../src/lib/provider-router.js";
import { buildProviderStatusPayload } from "../../src/routes/providers.js";

const OLD_ENV = { ...process.env };

test.afterEach(() => {
  process.env.OPENROUTER_API_KEY = OLD_ENV.OPENROUTER_API_KEY;
  process.env.OPENROUTER_KEY = OLD_ENV.OPENROUTER_KEY;
});

test("OpenRouter header wins over env aliases", () => {
  process.env.OPENROUTER_API_KEY = "env-api-key";
  process.env.OPENROUTER_KEY = "legacy-key";
  const keys = extractKeys({ headers: { "x-openrouter-api-key": " header-key " } });
  assert.equal(keys.openrouterKey, "header-key");
});

test("OPENROUTER_API_KEY is the primary server-side env name", () => {
  delete process.env.OPENROUTER_KEY;
  process.env.OPENROUTER_API_KEY = "env-api-key";
  const keys = extractKeys({ headers: {} });
  assert.equal(keys.openrouterKey, "env-api-key");
});

test("OPENROUTER_KEY remains a backwards-compatible fallback", () => {
  delete process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_KEY = "legacy-key";
  const keys = extractKeys({ headers: {} });
  assert.equal(keys.openrouterKey, "legacy-key");
});

test("provider status probe uses OPENROUTER_KEY fallback consistently", async () => {
  delete process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_KEY = "legacy-key";
  let authorization = "";

  const payload = await buildProviderStatusPayload({
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
  }, {
    cacheKey: "openrouter-key-fallback-status-probe",
    bypassCache: true,
    fetchFn: async (_url, init) => {
      authorization = String(new Headers(init?.headers).get("authorization") ?? "");
      return new Response(JSON.stringify({ data: [{ id: "openai/gpt-4.1" }] }), { status: 200 }) as any;
    },
  });

  assert.equal(authorization, "Bearer legacy-key");
  assert.equal(payload.providers.openrouter.configured, true);
  assert.equal(payload.providers.openrouter.healthy, true);
});
