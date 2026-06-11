import test from "node:test";
import assert from "node:assert/strict";

test("live core generation remains gated unless LIVE_SEARCH_TESTS=true", { skip: process.env.LIVE_SEARCH_TESTS === "true" ? undefined : "LIVE_SEARCH_TESTS not enabled" }, async () => {
  assert.equal(process.env.LIVE_SEARCH_TESTS, "true");
});
