import test from "node:test";
import assert from "node:assert/strict";
import { extractProviderKeys, type ProviderKeyEnv } from "../../src/core/providers/provider-key-extraction.js";

test("extractProviderKeys trims values and accepts header arrays case-insensitively", () => {
  const keys = extractProviderKeys({
    headers: {
      "X-GROQ-API-KEY": ["  gsk-live  ", "ignored"],
      "x-openrouter-api-key": "  or-live  ",
      "X-GitHub-Token": ["  gh-live  "],
      "x-nvidia-api-key": "  nvapi-live  ",
    },
  }, {});

  assert.equal(keys.groqKey, "gsk-live");
  assert.equal(keys.openrouterKey, "or-live");
  assert.equal(keys.githubToken, "gh-live");
  assert.equal(keys.nvidiaKey, "nvapi-live");
});

test("extractProviderKeys preserves search and extraction provider keys", () => {
  const keys = extractProviderKeys({
    headers: {
      "x-tavily-api-key": "tvly",
      "x-serper-api-key": "serper",
      "x-exa-api-key": "exa",
      "x-brave-api-key": "brave",
      "x-firecrawl-api-key": "firecrawl",
      "x-jina-api-key": "jina",
    },
  }, {});

  assert.equal(keys.tavilyKey, "tvly");
  assert.equal(keys.serperKey, "serper");
  assert.equal(keys.exaKey, "exa");
  assert.equal(keys.braveKey, "brave");
  assert.equal(keys.firecrawlKey, "firecrawl");
  assert.equal(keys.jinaKey, "jina");
});

test("extractProviderKeys supports server env fallback", () => {
  const keys = extractProviderKeys({ headers: {} }, {
    GROQ_API_KEY: "gsk-env",
    OLLAMA_API_KEY: "ollama-env",
    OLLAMA_BASE_URL: "http://ollama.local:11434",
    NVIDIA_API_KEY: "nvapi-env",
    GEMINI_API_KEY: "gemini-env",
    OPENROUTER_API_KEY: "or-env",
    GITHUB_MODELS_API_KEY: "github-models-env",
    TAVILY_API_KEY: "tvly-env",
    SERPER_API_KEY: "serper-env",
    FIRECRAWL_API_KEY: "fc-env",
    EXA_API_KEY: "exa-env",
    BRAVE_API_KEY: "brave-env",
    JINA_API_KEY: "jina-env",
    HF_TOKEN: "hf-env",
  });

  assert.equal(keys.groqKey, "gsk-env");
  assert.equal(keys.ollamaKey, "ollama-env");
  assert.equal(keys.ollamaBase, "http://ollama.local:11434");
  assert.equal(keys.nvidiaKey, "nvapi-env");
  assert.equal(keys.geminiKey, "gemini-env");
  assert.equal(keys.openrouterKey, "or-env");
  assert.equal(keys.githubToken, "github-models-env");
  assert.equal(keys.tavilyKey, "tvly-env");
  assert.equal(keys.serperKey, "serper-env");
  assert.equal(keys.firecrawlKey, "fc-env");
  assert.equal(keys.exaKey, "exa-env");
  assert.equal(keys.braveKey, "brave-env");
  assert.equal(keys.jinaKey, "jina-env");
  assert.equal(keys.hfToken, "hf-env");
});

test("extractProviderKeys joins numbered rollback keys for multi-key fallback", () => {
  const keys = extractProviderKeys({ headers: {} }, {
    GROQ_API_KEY_1: "gsk-env-1",
    GROQ_API_KEY_2: "gsk-env-2",
    OPENROUTER_API_KEY_1: "or-env-1",
    OPENROUTER_API_KEY_2: "or-env-2",
    TAVILY_API_KEY_1: "tvly-env-1",
    TAVILY_API_KEY_2: "tvly-env-2",
    FIRECRAWL_API_KEY_1: "fc-env-1",
    FIRECRAWL_API_KEY_2: "fc-env-2",
  } as ProviderKeyEnv);

  assert.equal(keys.groqKey, "gsk-env-1,gsk-env-2");
  assert.equal(keys.openrouterKey, "or-env-1,or-env-2");
  assert.equal(keys.tavilyKey, "tvly-env-1,tvly-env-2");
  assert.equal(keys.firecrawlKey, "fc-env-1,fc-env-2");
});

test("extractProviderKeys ignores placeholder rollback values", () => {
  const keys = extractProviderKeys({ headers: {} }, {
    TAVILY_API_KEY_1: "your_tavily_api_key_1",
    TAVILY_API_KEY_2: "tvly-env-2",
    FIRECRAWL_API_KEY_1: "insert_firecrawl_key",
    FIRECRAWL_API_KEY_2: "fc-env-2",
  } as ProviderKeyEnv);

  assert.equal(keys.tavilyKey, "tvly-env-2");
  assert.equal(keys.firecrawlKey, "fc-env-2");
});

test("extractProviderKeys preserves comma-separated header fallback keys", () => {
  const keys = extractProviderKeys({
    headers: {
      "x-tavily-api-key": " tvly-1, your_tavily_api_key_2, tvly-3 ",
      "x-groq-api-key": "gsk-1,gsk-2",
    },
  }, {});

  assert.equal(keys.tavilyKey, "tvly-1,tvly-3");
  assert.equal(keys.groqKey, "gsk-1,gsk-2");
});
