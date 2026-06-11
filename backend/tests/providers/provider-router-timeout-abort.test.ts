import test from "node:test";
import assert from "node:assert/strict";

import { ProviderRouter } from "../../src/core/providers/provider-router.js";
import type { ModelProvider, ProviderRequest } from "../../src/core/providers/provider-types.js";

test("provider router timeout aborts underlying provider work", async () => {
  let aborted = false;
  const provider: ModelProvider = {
    name: "groq",
    complete(request: ProviderRequest) {
      return new Promise((_, reject) => {
        request.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("provider work aborted"));
        }, { once: true });
      });
    },
  };
  const router = new ProviderRouter();
  router.register(provider);

  await assert.rejects(
    () => router.complete("groq", {
      model: "test",
      messages: [{ role: "user", content: "hello" }],
      timeoutMs: 5,
    }),
    /timeout|aborted|provider/i,
  );
  assert.equal(aborted, true);
});
