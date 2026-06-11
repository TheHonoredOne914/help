import test from "node:test";
import assert from "node:assert/strict";
import { multiKeyFetch } from "../../src/lib/multi-key-fetch.js";

test("multiKeyFetch retries authorization header keys after rate limit", async () => {
  const originalFetch = globalThis.fetch;
  const seen: string[] = [];
  try {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push(headers.get("Authorization") ?? "");
      return new Response("{}", { status: seen.length === 1 ? 429 : 200 });
    }) as typeof fetch;

    const response = await multiKeyFetch("https://example.test/chat", {
      headers: { Authorization: "Bearer header-key-one,header-key-two" },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(seen, ["Bearer header-key-one", "Bearer header-key-two"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("multiKeyFetch retries query parameter keys after auth failure", async () => {
  const originalFetch = globalThis.fetch;
  const seen: string[] = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(input.toString());
      seen.push(url.searchParams.get("api_key") ?? "");
      return new Response("{}", { status: seen.length === 1 ? 403 : 200 });
    }) as typeof fetch;

    const response = await multiKeyFetch("https://api.scraperapi.com/?api_key=query-key-one,query-key-two&url=https%3A%2F%2Fexample.com");

    assert.equal(response.status, 200);
    assert.deepEqual(seen, ["query-key-one", "query-key-two"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("multiKeyFetch rotates GitHub model headers", async () => {
  const originalFetch = globalThis.fetch;
  const seen: string[] = [];
  try {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push(headers.get("X-GitHub-Models-Api-Key") ?? "");
      return new Response("{}", { status: seen.length === 1 ? 402 : 200 });
    }) as typeof fetch;

    const response = await multiKeyFetch("https://models.inference.ai.azure.com/chat/completions", {
      headers: { "X-GitHub-Models-Api-Key": "github-key-one,github-key-two" },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(seen, ["github-key-one", "github-key-two"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("multiKeyFetch retries Tavily usage-limit status 432", async () => {
  const originalFetch = globalThis.fetch;
  const seen: string[] = [];
  try {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push(headers.get("Authorization") ?? "");
      return new Response("{}", { status: seen.length === 1 ? 432 : 200 });
    }) as typeof fetch;

    const response = await multiKeyFetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { Authorization: "Bearer tavily-limit-one,tavily-limit-two" },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(seen, ["Bearer tavily-limit-one", "Bearer tavily-limit-two"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
