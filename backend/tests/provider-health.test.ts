import assert from "node:assert/strict";
import test from "node:test";

import { extractKeys, resolveProvider } from "../src/lib/provider-router.js";
import * as healthModule from "../src/routes/health.js";

test("rejects model ids with unsupported provider prefixes", () => {
  assert.throws(
    () =>
      resolveProvider("unknown/model-a", {
        groqKey: null,
        ollamaKey: null,
        ollamaBase: null,
        nvidiaKey: null,
        geminiKey: null,
        openrouterKey: null,
        tavilyKey: null,
        serperKey: null,
        exaKey: null,
        braveKey: null,
        firecrawlKey: null,
        jinaKey: null,
        hfToken: null,
      }),
    /Unknown provider prefix/i,
  );
});

test("rejects malformed model ids with empty provider or empty model segments", () => {
  const emptyKeys = {
    groqKey: null,
    ollamaKey: null,
    ollamaBase: null,
    nvidiaKey: null,
    geminiKey: null,
    openrouterKey: null,
    tavilyKey: null,
    serperKey: null,
    exaKey: null,
    braveKey: null,
    firecrawlKey: null,
    jinaKey: null,
    hfToken: null,
  };

  assert.throws(() => resolveProvider("/model-a", emptyKeys), /Invalid model ID/i);
  assert.throws(() => resolveProvider("groq/", emptyKeys), /Invalid model ID/i);
});

test("extractKeys trims values, accepts header arrays, and matches headers case-insensitively", () => {
  const keys = extractKeys({
    headers: {
      "X-GROQ-API-KEY": "  groq-key  ",
      "x-ollama-api-key": [" ollama-key ", "ignored"],
      "X-Ollama-Base-Url": " http://localhost:11434/api ",
      "x-nvidia-api-key": "   ",
      "X-GEMINI-API-KEY": " gemini-key ",
      "x-openrouter-api-key": "openrouter-key",
      "x-tavily-api-key": " tavily-key ",
      "x-hf-token": " hf-token ",
    } as Record<string, string | string[] | undefined>,
  });

  assert.deepEqual(keys, {
    groqKey: "groq-key",
    ollamaKey: "ollama-key",
    ollamaBase: "http://localhost:11434/api",
    nvidiaKey: null,
    geminiKey: "gemini-key",
    openrouterKey: "openrouter-key",
    githubToken: null,
    tavilyKey: "tavily-key",
    serperKey: null,
    exaKey: null,
    braveKey: null,
    firecrawlKey: null,
    jinaKey: null,
    hfToken: "hf-token",
  });
});

test("health diagnostics report degraded when a configured provider probe fails", () => {
  assert.equal(typeof healthModule.buildProviderDiagnostics, "function");

  const payload = healthModule.buildProviderDiagnostics({
    uptime: 123,
    providers: {
      groq: { enabled: true, ok: true },
      ollama: { enabled: true, ok: false, error: new Error("ollama timed out") },
      nvidia: { enabled: false, ok: false },
    },
  });

  assert.deepEqual(payload, {
    status: "degraded",
    uptime: 123,
    groq: "connected",
    ollama: "error",
    nvidia: "missing",
    providers: {
      groq: { status: "connected" },
      ollama: { status: "error", message: "ollama timed out" },
      nvidia: { status: "missing" },
    },
  });
});
