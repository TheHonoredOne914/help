import test from "node:test";
import assert from "node:assert/strict";
import { extractKeys } from "../../src/lib/provider-router.js";

test("search provider keys are extracted from request headers", () => {
  const keys = extractKeys({
    headers: {
      "x-serper-api-key": " serper-header ",
      "x-exa-api-key": " exa-header ",
      "x-firecrawl-api-key": " firecrawl-header ",
    },
  });

  assert.equal(keys.serperKey, "serper-header");
  assert.equal(keys.exaKey, "exa-header");
  assert.equal(keys.firecrawlKey, "firecrawl-header");
});

test("search provider keys fall back to environment variables", () => {
  const previous = {
    serper: process.env.SERPER_API_KEY,
    exa: process.env.EXA_API_KEY,
    firecrawl: process.env.FIRECRAWL_API_KEY,
  };
  process.env.SERPER_API_KEY = "serper-env";
  process.env.EXA_API_KEY = "exa-env";
  process.env.FIRECRAWL_API_KEY = "firecrawl-env";
  try {
    const keys = extractKeys({ headers: {} });
    assert.equal(keys.serperKey, "serper-env");
    assert.equal(keys.exaKey, "exa-env");
    assert.equal(keys.firecrawlKey, "firecrawl-env");
  } finally {
    restoreEnv("SERPER_API_KEY", previous.serper);
    restoreEnv("EXA_API_KEY", previous.exa);
    restoreEnv("FIRECRAWL_API_KEY", previous.firecrawl);
  }
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
