import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import { verifyAnswer } from "../src/lib/verify.js";

const sampleSources = [
  {
    title: "Source One",
    url: "https://example.com/one",
    snippet: "Example supporting snippet.",
    engine: "tavily" as const,
    score: 8,
    sourceType: "general" as const,
  },
  {
    title: "Source Two",
    url: "https://example.com/two",
    snippet: "Second supporting snippet.",
    engine: "tavily" as const,
    score: 7,
    sourceType: "general" as const,
  },
];

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("returns a degraded unverified result when no verifier keys are configured", async () => {
  const result = await verifyAnswer(
    "What happened?",
    sampleSources,
    "An answer that still needs verification.",
    {},
  );

  assert.equal(result.verified, false);
  assert.equal(result.confidence, 0);
  assert.match(result.notes, /verification unavailable/i);
  assert.deepEqual(result.thinking, []);
  assert.equal(result.model, "fallback");
  assert.equal(result.modelFull, "No Verifier");
  assert.deepEqual(result.sources, sampleSources.map(({ title, url }) => ({ title, url })));
});

test("returns a degraded unverified result when the primary verifier fails and no secondary verifier is usable", async () => {
  globalThis.fetch = async () => {
    throw new Error("Gemini exploded");
  };

  const result = await verifyAnswer(
    "Question",
    sampleSources,
    "Answer",
    { geminiKey: "gemini-test-key" },
  );

  assert.equal(result.verified, false);
  assert.equal(result.confidence, 0);
  assert.match(result.notes, /verification unavailable|verification degraded/i);
  assert.equal(result.model, "fallback");
  assert.match(result.modelFull, /Verifier Degraded|No Verifier/);
});

test("treats malformed verifier content as degraded instead of trusted success", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "{\"verified\": true, \"confidence\": 93, \"notes\": \"looks good\"",
            },
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );

  const result = await verifyAnswer(
    "Question",
    sampleSources,
    "Answer",
    { geminiKey: "gemini-test-key" },
  );

  assert.equal(result.verified, false);
  assert.equal(result.confidence, 0);
  assert.match(result.notes, /verification unavailable|verification degraded|malformed/i);
  assert.equal(result.model, "fallback");
});

test("does not imply trusted success when the qwen fallback ends on the heuristic path", async () => {
  globalThis.fetch = async () => {
    throw new Error("NVIDIA unavailable");
  };

  const chunks: string[] = [];
  const result = await verifyAnswer(
    "Question",
    sampleSources,
    "Answer",
    {
      nvidiaKey: "nvidia-test-key",
      onChunk: (chunk) => chunks.push(chunk),
    },
  );

  assert.ok(chunks.length > 0);
  assert.equal(result.verified, false);
  assert.equal(result.confidence, 0);
  assert.match(result.notes, /verification degraded|verification unavailable/i);
  assert.equal(result.model, "fallback");
});
