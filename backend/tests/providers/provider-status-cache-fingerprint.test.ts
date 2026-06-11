import test from "node:test";
import assert from "node:assert/strict";
import { fingerprint, statusCacheKey } from "../../src/routes/providers.js";

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

test("provider status cache key uses provider-labeled SHA-256 fingerprints without raw key text", () => {
  const keyText = "nvapi-secret-value-that-must-not-appear";
  const cacheKey = statusCacheKey({ ...emptyKeys, nvidiaKey: keyText, groqKey: "gsk-secret" });

  assert.match(cacheKey, /nvidia:[a-f0-9]{12}/);
  assert.match(cacheKey, /groq:[a-f0-9]{12}/);
  assert.doesNotMatch(cacheKey, /nvapi-secret-value/);
  assert.doesNotMatch(cacheKey, /gsk-secret/);
  assert.equal(fingerprint(keyText).length, 12);
});
