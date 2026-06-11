import test from "node:test";
import assert from "node:assert/strict";
import { getHealthyProvidersForResearch } from "../../src/core/providers/provider-health.js";

test("missing provider status does not become healthy when statuses are supplied", () => {
  const summary = getHealthyProvidersForResearch({
    selectedProvider: "groq",
    selectedModel: "llama-3.3-70b-versatile",
    providerStatuses: [{ providerName: "github", configured: true, healthy: true, models: ["openai/gpt-4.1"] }],
  });

  assert.equal(summary.healthyProviders.some((item) => item.providerName === "groq"), false);
  assert.match(summary.errors.join("\n"), /status_unknown_assumed_unhealthy/);
});

test("selected provider can be trusted without status only when explicitly allowed", () => {
  const denied = getHealthyProvidersForResearch({
    selectedProvider: "groq",
    selectedModel: "llama-3.3-70b-versatile",
    providerStatuses: [],
  });
  assert.equal(denied.healthyProviders.length, 0);

  const allowed = getHealthyProvidersForResearch({
    selectedProvider: "groq",
    selectedModel: "llama-3.3-70b-versatile",
    trustRegisteredProvidersWithoutStatus: true,
  });
  assert.equal(allowed.healthyProviders[0]?.providerName, "groq");
  assert.match(allowed.errors.join("\n"), /status_unknown_assumed_registered/);
});

test("rate-limited and unavailable statuses exclude providers", () => {
  const summary = getHealthyProvidersForResearch({
    selectedProvider: "groq",
    selectedModel: "llama-3.3-70b-versatile",
    fallbackModels: [{ providerName: "github", model: "openai/gpt-4.1" }],
    providerStatuses: [
      { providerName: "groq", configured: true, healthy: false, status: "rate_limited" },
      { providerName: "github", configured: true, healthy: false, status: "network_error" },
    ],
  });
  assert.equal(summary.healthyProviders.length, 0);
  assert.deepEqual(summary.unhealthyProviders.map((item) => item.reason), ["rate_limited", "network_error"]);
});
