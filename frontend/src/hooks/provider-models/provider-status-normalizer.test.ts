import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProviderStatus, isProviderDisplayable, isProviderResearchUsable, isProviderSelectableForUser, isProviderChatVerifiedForAutoUse } from "./provider-status-normalizer";

test("healthy live payload becomes healthy and research usable", () => {
  const status = normalizeProviderStatus("groq", {
    configured: true,
    healthy: true,
    status: "healthy",
    source: "live",
    modelCount: 2,
    canChat: true,
    chatVerified: true,
    canListModels: true,
    liveModelListVerified: true,
    catalogFallbackOnly: false,
  });

  assert.equal(status.healthy, true);
  assert.equal(status.status, "healthy");
  assert.equal(status.liveModelListVerified, true);
  assert.equal(status.catalogFallbackOnly, false);
  assert.equal(status.chatVerified, true);
  assert.equal(isProviderResearchUsable(status), true);
  assert.equal(isProviderChatVerifiedForAutoUse(status), true);
  assert.equal(isProviderDisplayable(status, [{ id: "llama-3.3-70b-versatile" }]), true);
});

test("catalog_fallback with models is displayable but not healthy", () => {
  const status = normalizeProviderStatus("openrouter", {
    configured: true,
    healthy: false,
    status: "catalog_fallback",
    source: "catalog_fallback",
    models: [{ id: "anthropic/claude-sonnet-4.5" }],
    canListModels: true,
    chatVerified: false,
    liveModelListVerified: false,
    catalogFallbackOnly: true,
  });

  assert.equal(status.healthy, false);
  assert.equal(status.status, "catalog_fallback");
  assert.equal(status.liveModelListVerified, false);
  assert.equal(status.catalogFallbackOnly, true);
  assert.equal(status.chatVerified, false);
  assert.equal(isProviderDisplayable(status, [{ id: "anthropic/claude-sonnet-4.5" }]), true);
  assert.equal(isProviderResearchUsable(status), false);
  assert.equal(isProviderSelectableForUser(status, [{ id: "anthropic/claude-sonnet-4.5" }]), true);
  assert.equal(isProviderChatVerifiedForAutoUse(status), false);
});

test("network_error and unavailable are not research usable", () => {
  for (const rawStatus of ["network_error", "unavailable"] as const) {
    const status = normalizeProviderStatus("nvidia", {
      configured: true,
      healthy: false,
      status: rawStatus,
      canChat: false,
      canListModels: rawStatus === "network_error",
    });

    assert.equal(status.healthy, false);
    assert.equal(isProviderResearchUsable(status), false);
  }
});

test("canChat true alone does not make provider auto-usable for research", () => {
  const status = normalizeProviderStatus("github", {
    configured: true,
    healthy: false,
    status: "unverified",
    canChat: true,
    chatVerified: false,
    canListModels: false,
  });

  assert.equal(status.healthy, false);
  assert.equal(isProviderResearchUsable(status), false);
  assert.equal(isProviderChatVerifiedForAutoUse(status), false);
});

test("unknown status maps safely to unavailable", () => {
  const status = normalizeProviderStatus("gemini", {
    configured: true,
    healthy: false,
    status: "surprising_new_state",
  });

  assert.equal(status.status, "unavailable");
  assert.equal(status.healthy, false);
  assert.equal(isProviderResearchUsable(status), false);
});
