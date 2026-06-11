import test from "node:test";
import assert from "node:assert/strict";
import { selectHealthyModelForMode } from "../../src/core/providers/model-strategy.js";

test("autoFallback=false keeps research execution on the selected model only", () => {
  const selected = { providerName: "groq" as const, model: "llama-3.3-70b-versatile" };
  const picked = selectHealthyModelForMode({
    mode: "fast_research",
    selected,
    autoFallback: false,
    providerStatuses: [
      { providerName: "groq", configured: true, status: "unverified", healthy: false, canChat: true, chatVerified: false },
      { providerName: "nvidia", configured: true, status: "healthy", healthy: true, canChat: true, chatVerified: true },
    ],
  });

  assert.deepEqual(picked, selected);
});

test("autoFallback=false does not invent default provider candidates", () => {
  const picked = selectHealthyModelForMode({
    mode: "fast_research",
    autoFallback: false,
    providerStatuses: [
      { providerName: "nvidia", configured: true, status: "healthy", healthy: true, canChat: true, chatVerified: true },
    ],
  });

  assert.equal(picked, null);
});

test("autoFallback=true allows explicit fallback candidates", () => {
  const picked = selectHealthyModelForMode({
    mode: "fast_research",
    selected: { providerName: "groq", model: "llama-3.3-70b-versatile" },
    autoFallback: true,
    providerStatuses: [
      { providerName: "groq", configured: true, status: "rate_limited", healthy: false, canChat: false, chatVerified: false },
      { providerName: "nvidia", configured: true, status: "healthy", healthy: true, canChat: true, chatVerified: true },
    ],
  });

  assert.deepEqual(picked, { providerName: "nvidia", model: "nvidia/llama-3.3-nemotron-super-49b-v1" });
});
