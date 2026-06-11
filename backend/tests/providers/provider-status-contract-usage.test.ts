import test from "node:test";
import assert from "node:assert/strict";
import { deriveProviderHealthPolicy } from "../../src/core/providers/provider-health-policy.js";
import { isUsableProviderStatus } from "../../src/core/providers/provider-status-contract.js";
import { httpStatusForProviderStatus } from "../../src/core/providers/provider-model-route-contract.js";

test("catalog fallback is display-only and not research-usable provider health", () => {
  assert.equal(isUsableProviderStatus("healthy"), true);
  assert.equal(isUsableProviderStatus("catalog_fallback"), false);
  assert.equal(isUsableProviderStatus("unverified"), false);
  assert.equal(isUsableProviderStatus("missing_key"), false);
  assert.equal(isUsableProviderStatus("invalid_key"), false);
  assert.equal(isUsableProviderStatus("network_error"), false);

  const policy = deriveProviderHealthPolicy({
    configured: true,
    healthy: true,
    status: "catalog_fallback",
    source: "catalog_fallback",
    modelCount: 3,
  });

  assert.equal(policy.healthy, false);
  assert.equal(policy.canChat, false);
  assert.equal(policy.canListModels, true);
  assert.equal(policy.catalogFallbackOnly, true);
});

test("billing credits status is non-usable and preserves HTTP 402", () => {
  assert.equal(isUsableProviderStatus("billing_credits"), false);
  assert.equal(httpStatusForProviderStatus("billing_credits"), 402);

  const policy = deriveProviderHealthPolicy({
    configured: true,
    healthy: false,
    status: "billing_credits",
    source: "live",
    modelCount: 0,
  });

  assert.equal(policy.healthy, false);
  assert.equal(policy.canChat, false);
  assert.equal(policy.chatVerified, false);
});
