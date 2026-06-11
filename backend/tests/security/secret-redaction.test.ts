import test from "node:test";
import assert from "node:assert/strict";
import { redactSecretString, redactSecretsDeep, safeLog } from "../../src/core/security/secret-redaction.js";

test("redactSecretString removes provider key formats and authorization headers", () => {
  const redacted = redactSecretString("Authorization: Bearer sk-or-v1-abc1234567890 and x-api-key: gsk_abc1234567890 plus tvly-dev-secret and jina_secret AIzaSySecret");

  assert.doesNotMatch(redacted, /sk-or-v1-abc|gsk_abc|tvly-dev-secret|jina_secret|AIzaSySecret|Bearer sk-or/i);
  assert.match(redacted, /\[REDACTED_SECRET\]/);
});

test("redactSecretsDeep protects nested logs, provider errors, SSE payloads, and saved state", () => {
  const payload = {
    error: { message: "provider failed with gsk_nestedsecret123" },
    headers: { authorization: "Bearer sk-or-v1-nested", "x-api-key": "tvly-dev-nested", apiKey: "plain-local-secret" },
    pipelineState: [{ token: "jina_nestedsecret123" }],
    ssePayload: { corePipelineData: { openrouterKey: "plain-openrouter-secret" } },
    cacheWrite: { providerError: "Authorization: Bearer sk-or-v1-cache-secret" },
  };
  const redacted = redactSecretsDeep(payload);

  assert.doesNotMatch(JSON.stringify(redacted), /gsk_nested|sk-or-v1-nested|tvly-dev-nested|jina_nested|plain-local-secret|plain-openrouter-secret|sk-or-v1-cache-secret/);
  assert.match(JSON.stringify(redacted), /REDACTED_SECRET/);
});

test("safeLog redacts before writing", () => {
  assert.doesNotThrow(() => safeLog("secret-test", { key: "gsk_safeLogSecret123" }));
});
