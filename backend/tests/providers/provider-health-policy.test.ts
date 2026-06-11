import test from "node:test";
import assert from "node:assert/strict";
import { deriveProviderHealthPolicy } from "../../src/core/providers/provider-health-policy.js";

test("catalog fallback is display-only and never healthy", () => {
  const policy = deriveProviderHealthPolicy({
    configured: true,
    healthy: true,
    status: "catalog_fallback",
    source: "catalog_fallback",
    modelCount: 8,
  });

  assert.equal(policy.healthy, false);
  assert.equal(policy.canChat, false);
  assert.equal(policy.chatVerified, false);
  assert.equal(policy.canListModels, true);
  assert.equal(policy.liveModelListVerified, false);
  assert.equal(policy.catalogFallbackOnly, true);
});

test("unverified catalog models are listable but not chat-usable", () => {
  const policy = deriveProviderHealthPolicy({
    configured: true,
    healthy: false,
    status: "unverified",
    source: "catalog_fallback",
    modelCount: 4,
    canChat: true,
    canListModels: true,
  });

  assert.equal(policy.healthy, false);
  assert.equal(policy.canChat, false);
  assert.equal(policy.chatVerified, false);
  assert.equal(policy.canListModels, true);
  assert.equal(policy.liveModelListVerified, false);
  assert.equal(policy.catalogFallbackOnly, true);
});

test("status_unknown is not healthy when statuses are supplied", () => {
  const policy = deriveProviderHealthPolicy({
    configured: true,
    healthy: true,
    status: "status_unknown",
    source: "live",
    modelCount: 1,
    providerStatusesSupplied: true,
  });

  assert.equal(policy.healthy, false);
  assert.equal(policy.canChat, false);
  assert.equal(policy.chatVerified, false);
  assert.equal(policy.liveModelListVerified, false);
  assert.equal(policy.catalogFallbackOnly, false);
});

test("healthy live provider verifies model listing and chat capability", () => {
  const policy = deriveProviderHealthPolicy({
    configured: true,
    healthy: true,
    status: "healthy",
    source: "live",
    modelCount: 2,
  });

  assert.equal(policy.healthy, true);
  assert.equal(policy.canChat, true);
  assert.equal(policy.chatVerified, true);
  assert.equal(policy.canListModels, true);
  assert.equal(policy.liveModelListVerified, true);
  assert.equal(policy.catalogFallbackOnly, false);
});

test("206/catalog model-list fallback can list models but is not chat verified", () => {
  const policy = deriveProviderHealthPolicy({
    configured: true,
    healthy: false,
    status: "catalog_fallback",
    source: "catalog_fallback",
    modelCount: 5,
    canListModels: true,
    canChat: true,
  });

  assert.equal(policy.canListModels, true);
  assert.equal(policy.catalogFallbackOnly, true);
  assert.equal(policy.chatVerified, false);
});
