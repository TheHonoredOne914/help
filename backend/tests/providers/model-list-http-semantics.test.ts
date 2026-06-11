import test from "node:test";
import assert from "node:assert/strict";
import {
  httpStatusForProviderStatus,
  providerRouteErrorPayload,
  sendProviderStatusPayload,
} from "../../src/routes/providers.js";

test("expected provider model-list statuses use truthful HTTP semantics", () => {
  assert.equal(httpStatusForProviderStatus("healthy"), 200);
  assert.equal(httpStatusForProviderStatus("checking"), 202);
  assert.equal(httpStatusForProviderStatus("missing_key"), 401);
  assert.equal(httpStatusForProviderStatus("invalid_key"), 401);
  assert.equal(httpStatusForProviderStatus("rate_limited"), 429);
  assert.equal(httpStatusForProviderStatus("network_error"), 502);
  assert.equal(httpStatusForProviderStatus("unavailable"), 503);
  assert.equal(httpStatusForProviderStatus("catalog_fallback"), 206);
  assert.equal(httpStatusForProviderStatus("unverified"), 206);
});

test("catalog_fallback payload returns 200 with healthy false and display models", () => {
  let statusCode = 0;
  let body: any;
  sendProviderStatusPayload({
    status(code: number) {
      statusCode = code;
      return { json(payload: unknown) { body = payload; } };
    },
  }, {
    provider: "groq",
    configured: true,
    healthy: false,
    status: "catalog_fallback",
    source: "catalog_fallback",
    models: [{ id: "llama-3.3-70b-versatile" }],
    modelCount: 1,
    canChat: false,
    canListModels: true,
  });

  assert.equal(statusCode, 206);
  assert.equal(body.healthy, false);
  assert.equal(body.canChat, false);
  assert.equal(body.canListModels, true);
  assert.equal(body.liveModelListVerified, false);
  assert.equal(body.catalogFallbackOnly, true);
});

test("provider route error payload does not leak raw keys", () => {
  const payload = providerRouteErrorPayload("groq", "network_error", "failed sk-test-secret token", true) as any;
  assert.doesNotMatch(JSON.stringify(payload), /sk-test-secret/);
});

test("provider route error payload only uses catalog_fallback source when catalog models are returned", () => {
  const missing = providerRouteErrorPayload("groq", "missing_key", "missing", false) as any;
  const invalid = providerRouteErrorPayload("nvidia", "invalid_key", "invalid", true) as any;
  const fallback = providerRouteErrorPayload("openrouter", "catalog_fallback", "fallback", true) as any;

  assert.equal(missing.source, "live");
  assert.equal(invalid.source, "live");
  assert.equal(fallback.source, "catalog_fallback");
});

test("actual server bug is still represented as 500 by explicit helper call", () => {
  let statusCode = 0;
  sendProviderStatusPayload({
    status(code: number) {
      statusCode = code;
      return { json() {} };
    },
  }, { error: "internal", status: "server_error" }, { serverError: true });
  assert.equal(statusCode, 500);
});
