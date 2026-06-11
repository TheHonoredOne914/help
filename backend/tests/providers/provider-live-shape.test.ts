import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRouter } from "../../src/core/providers/provider-router.js";

test("provider router retries JSON task failures and preserves role metadata", async () => {
  let attempts = 0;
  const router = new ProviderRouter();
  router.register({
    name: "groq",
    complete: async (request) => {
      attempts += 1;
      return {
        provider: "groq",
        model: request.model,
        roleName: request.roleName,
        content: attempts === 1 ? "not-json" : "{\"ok\":true}",
      };
    },
  });

  const response = await router.completeJson("groq", {
    model: "test",
    roleName: "citation_auditor",
    messages: [{ role: "user", content: "return json" }],
    retries: 1,
  });

  assert.equal(attempts, 2);
  assert.equal(response.roleName, "citation_auditor");
  assert.deepEqual(response.json, { ok: true });
});

test("timeout produces redacted safe provider error", async () => {
  const router = new ProviderRouter();
  router.register({
    name: "openrouter",
    complete: async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      throw new Error("bad key sk-or-v1-secret");
    },
  });

  await assert.rejects(
    () => router.complete("openrouter", { model: "x", messages: [{ role: "user", content: "hi" }], timeoutMs: 5 }),
    /timeout|REDACTED/i,
  );
});
