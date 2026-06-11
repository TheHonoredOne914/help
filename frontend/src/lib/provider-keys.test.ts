import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROVIDER_KEYS, getProviderHeadersFromKeys } from "./provider-keys";

test("search and extraction provider headers are sent only when configured", () => {
  const headers = getProviderHeadersFromKeys({
    ...DEFAULT_PROVIDER_KEYS,
    serperApiKey: " serper-key ",
    exaApiKey: " exa-key ",
    firecrawlApiKey: " firecrawl-key ",
  });

  assert.equal(headers["X-Serper-Api-Key"], "serper-key");
  assert.equal(headers["X-Exa-Api-Key"], "exa-key");
  assert.equal(headers["X-Firecrawl-Api-Key"], "firecrawl-key");
  assert.equal(headers["X-Tavily-Api-Key"], undefined);
});
