import test from "node:test";
import assert from "node:assert/strict";
import { getStreamSilenceTimeoutMs } from "./stream-timeout";

test("deep PhD and FullSpectrum modes use four minute silence budget", () => {
  assert.equal(getStreamSilenceTimeoutMs("deep_research", ["groq/a"]), 240_000);
  assert.equal(getStreamSilenceTimeoutMs("deep_research", ["groq/a"]), 240_000);
  assert.equal(getStreamSilenceTimeoutMs("council", ["groq/a"]), 240_000);
});

test("multi-model research uses two and a half minute silence budget", () => {
  assert.equal(getStreamSilenceTimeoutMs("fast_research", ["groq/a", "nvidia/b"]), 150_000);
});

test("single model research uses one minute silence budget", () => {
  assert.equal(getStreamSilenceTimeoutMs("fast_research", ["groq/a"]), 60_000);
  assert.equal(getStreamSilenceTimeoutMs("normal", []), 60_000);
});
