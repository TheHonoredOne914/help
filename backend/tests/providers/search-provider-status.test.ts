import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchProviderStatus } from "../../src/core/search/search-provider-status.js";
import { exaSearchProvider } from "../../src/core/search/providers/exa-search-provider.js";
import { firecrawlExtractorProvider } from "../../src/core/search/providers/firecrawl-extractor-provider.js";
import { jinaExtractorProvider } from "../../src/core/search/providers/jina-extractor-provider.js";

test("rejected Exa health check is attributed to exa", async () => {
  const original = exaSearchProvider.healthCheck;
  exaSearchProvider.healthCheck = async () => {
    throw new Error("exa network down");
  };
  try {
    const status = await buildSearchProviderStatus({
      exa: "exa-key",
    }, {
      now: 10_000,
      bypassCache: true,
    });

    assert.equal(status.exa.provider, "exa");
    assert.equal(status.exa.status, "network_error");
    assert.equal(status.unknown, undefined);
    assert.notEqual(status.exa.provider, "serper");
  } finally {
    exaSearchProvider.healthCheck = original;
  }
});

test("rejected Firecrawl health check is attributed to firecrawl", async () => {
  const original = firecrawlExtractorProvider.healthCheck;
  firecrawlExtractorProvider.healthCheck = async () => {
    throw new Error("firecrawl timeout");
  };
  try {
    const status = await buildSearchProviderStatus({
      firecrawl: "firecrawl-key",
    }, {
      now: 11_000,
      bypassCache: true,
    });

    assert.equal(status.firecrawl.provider, "firecrawl");
    assert.equal(status.firecrawl.status, "timeout");
    assert.equal(status.unknown, undefined);
    assert.notEqual(status.firecrawl.provider, "serper");
  } finally {
    firecrawlExtractorProvider.healthCheck = original;
  }
});

test("rejected Jina health check is attributed to jina", async () => {
  const original = jinaExtractorProvider.healthCheck;
  jinaExtractorProvider.healthCheck = async () => {
    throw new Error("jina unavailable");
  };
  try {
    const status = await buildSearchProviderStatus({
      jina: "jina-key",
    }, {
      now: 12_000,
      bypassCache: true,
    });

    assert.equal(status.jina.provider, "jina");
    assert.equal(status.jina.status, "unavailable");
    assert.equal(status.unknown, undefined);
    assert.notEqual(status.jina.provider, "serper");
  } finally {
    jinaExtractorProvider.healthCheck = original;
  }
});
