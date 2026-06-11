import test from "node:test";
import assert from "node:assert/strict";
import {
  httpStatusForProviderStatus,
  normalizeProviderModelRoutePayload,
} from "../../src/core/providers/provider-model-route-contract.js";

test("provider model route statuses no longer report broad success", () => {
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

test("catalog fallback payload is degraded and capability-limited", () => {
  const payload = normalizeProviderModelRoutePayload({
    provider: "nvidia",
    configured: true,
    healthy: false,
    status: "catalog_fallback" as const,
    source: "catalog_fallback" as const,
    models: [{ id: "moonshotai/kimi-k2.6" }],
  });

  assert.equal(payload.healthy, false);
  assert.equal(payload.liveModelListVerified, false);
  assert.equal(payload.catalogFallbackOnly, true);
  assert.equal(payload.canChat, false);
  assert.equal(payload.canListModels, true);
});

test("live verified payload distinguishes chat health from model-list verification", () => {
  const payload = normalizeProviderModelRoutePayload({
    provider: "groq",
    configured: true,
    healthy: true,
    status: "healthy" as const,
    source: "live" as const,
    models: [{ id: "llama-3.3-70b-versatile" }],
  });

  assert.equal(payload.healthy, true);
  assert.equal(payload.liveModelListVerified, true);
  assert.equal(payload.catalogFallbackOnly, false);
  assert.equal(payload.canChat, true);
  assert.equal(payload.canListModels, true);
});
