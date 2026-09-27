import test from "node:test";
import assert from "node:assert/strict";
import { resolveStreamTimeoutMs } from "../../src/services/anthropic/message-preflight.js";

test("stream timeouts follow mode latency budgets instead of a 10-minute env default", () => {
  assert.equal(resolveStreamTimeoutMs("fast_research"), 95_000);
  assert.equal(resolveStreamTimeoutMs("web_search"), 95_000);
  assert.equal(resolveStreamTimeoutMs("deep_research"), 250_000);
  assert.equal(resolveStreamTimeoutMs("council"), 30 * 60 * 1000);
  assert.equal(resolveStreamTimeoutMs("normal"), 2 * 60 * 1000);
});
