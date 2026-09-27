import test from "node:test";
import assert from "node:assert/strict";
import {
  enrichSource,
  getExtractionApiMode,
  isHighValueExtractionSource,
  shouldCallPaidExtractors,
} from "../../../src/core/retrieval/enrichment/enrich-source.js";

const snippet = "DPDP privacy safeguards India proportionality court doctrine. ".repeat(8);

function withEnv(vars: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of previous.entries()) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

test("getExtractionApiMode defaults to high_value_only", () => {
  assert.equal(getExtractionApiMode({}), "high_value_only");
  assert.equal(getExtractionApiMode({ EXTRACTION_API_MODE: "never" }), "never");
  assert.equal(getExtractionApiMode({ EXTRACTION_API_MODE: "always" }), "always");
});

test("electoral and legal research hosts count as high-value extraction targets", () => {
  assert.equal(
    isHighValueExtractionSource({ title: "ADR", url: "https://adrindia.org/report", domain: "adrindia.org" }),
    true,
  );
  assert.equal(
    isHighValueExtractionSource({ title: "SC Observer", url: "https://www.scobserver.in/cases/x", domain: "scobserver.in" }),
    true,
  );
  assert.equal(
    isHighValueExtractionSource({ title: "Blog", url: "https://example.com/post", domain: "example.com" }),
    false,
  );
});

test("never mode skips paid extractors even with keys", async () => {
  await withEnv({ EXTRACTION_API_MODE: "never", LOCAL_EXTRACTOR_FIRST: "true" }, async () => {
    let apiHits = 0;
    const fetchFn = (async (url: string | URL | Request) => {
      const href = String(url);
      if (/jina|firecrawl|scraperapi|zenrows|scrapingbee|geekflare/i.test(href)) {
        apiHits += 1;
        return new Response("should not be called", { status: 200 });
      }
      return new Response("error", { status: 500 });
    }) as typeof fetch;

    const enriched = await enrichSource({
      title: "Low authority blog",
      url: "https://example.com/post",
      domain: "example.com",
      snippet,
      authorityScore: 20,
    }, {
      jinaKey: "test-jina-key",
      firecrawlKey: "test-firecrawl-key",
      fetchFn,
      useCache: false,
    });

    assert.equal(apiHits, 0);
    assert.equal(enriched.extractionMethod, "snippet_fallback");
  });
});

test("high_value_only uses Jina-only recovery for low-authority local-fail when jina key present", async () => {
  await withEnv({ EXTRACTION_API_MODE: "high_value_only", LOCAL_EXTRACTOR_FIRST: "true" }, async () => {
    let jinaHits = 0;
    let firecrawlHits = 0;
    const paidText = "Election Commission deepfake advisory requires labelled synthetic political ads across platforms in India. ".repeat(20);
    const fetchFn = (async (url: string | URL | Request) => {
      const href = String(url);
      if (/r.jina.ai|jina/i.test(href)) {
        jinaHits += 1;
        return new Response(paidText, { status: 200, headers: { "content-type": "text/plain" } });
      }
      if (/firecrawl/i.test(href)) {
        firecrawlHits += 1;
        return new Response(JSON.stringify({ data: { markdown: paidText } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("error", { status: 500 });
    }) as typeof fetch;

    const enriched = await enrichSource({
      title: "Random blog",
      url: "https://example.com/low",
      domain: "example.com",
      snippet,
      authorityScore: 35,
    }, {
      jinaKey: "test-jina-key",
      firecrawlKey: "test-firecrawl-key",
      fetchFn,
      useCache: false,
      query: "Election Commission deepfake advisory",
    });

    assert.ok(jinaHits >= 1, `expected jina recovery, got ${jinaHits}`);
    assert.equal(firecrawlHits, 0, "mid-tier must not call Firecrawl when Jina succeeds");
    assert.equal(
      shouldCallPaidExtractors(
        { title: "Random blog", url: "https://example.com/low", domain: "example.com", authorityScore: 35 },
        { jinaKey: "test-jina-key" },
        true,
        { EXTRACTION_API_MODE: "high_value_only" },
      ),
      true,
    );
    assert.ok(
      enriched.extractionMethod === "jina_reader" || Boolean(enriched.fullText),
      `unexpected method=${enriched.extractionMethod}`,
    );
  });
});

test("mid-tier escalates Firecrawl after Jina miss when firecrawl key present", async () => {
  await withEnv({ EXTRACTION_API_MODE: "high_value_only", LOCAL_EXTRACTOR_FIRST: "true" }, async () => {
    let jinaHits = 0;
    let firecrawlHits = 0;
    const paidText = "Election Commission deepfake advisory requires labelled synthetic political ads across platforms in India. ".repeat(20);
    const fetchFn = (async (url: string | URL | Request) => {
      const href = String(url);
      if (/r.jina.ai|jina/i.test(href)) {
        jinaHits += 1;
        return new Response("jina down", { status: 500 });
      }
      if (/firecrawl/i.test(href)) {
        firecrawlHits += 1;
        return new Response(JSON.stringify({ data: { markdown: paidText } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("error", { status: 500 });
    }) as typeof fetch;

    const enriched = await enrichSource({
      title: "Random blog",
      url: "https://example.com/low-escalate",
      domain: "example.com",
      snippet,
      authorityScore: 35,
    }, {
      jinaKey: "test-jina-key",
      firecrawlKey: "test-firecrawl-key",
      fetchFn,
      useCache: false,
      query: "Election Commission deepfake advisory",
    });

    assert.ok(jinaHits >= 1, `expected jina attempt, got ${jinaHits}`);
    assert.ok(firecrawlHits >= 1, `expected Firecrawl escalate after Jina miss, got ${firecrawlHits}`);
    assert.ok((enriched.fullText ?? "").length >= 100, `expected recovered text, method=${enriched.extractionMethod}`);
    assert.notEqual(enriched.extractionMethod, "snippet_fallback");
  });
});

test("high_value_only skips API for low-authority local-fail without jina key", async () => {
  await withEnv({ EXTRACTION_API_MODE: "high_value_only", LOCAL_EXTRACTOR_FIRST: "true" }, async () => {
    let apiHits = 0;
    const fetchFn = (async (url: string | URL | Request) => {
      const href = String(url);
      if (/jina|firecrawl|scraperapi|zenrows|scrapingbee|geekflare/i.test(href)) {
        apiHits += 1;
        return new Response("paid extractor body ".repeat(40), { status: 200 });
      }
      return new Response("error", { status: 500 });
    }) as typeof fetch;

    const enriched = await enrichSource({
      title: "Random blog",
      url: "https://example.com/low",
      domain: "example.com",
      snippet,
      authorityScore: 35,
    }, {
      firecrawlKey: "test-firecrawl-key",
      fetchFn,
      useCache: false,
    });

    assert.equal(apiHits, 0);
    assert.equal(
      shouldCallPaidExtractors(
        { title: "Random blog", url: "https://example.com/low", domain: "example.com", authorityScore: 35 },
        {},
        true,
        { EXTRACTION_API_MODE: "high_value_only" },
      ),
      false,
    );
    assert.equal(enriched.extractionMethod, "snippet_fallback");
  });
});

test("high_value_only treats major Indian media as high-value for API recovery", () => {
  assert.equal(
    shouldCallPaidExtractors(
      { title: "ECI deepfakes", url: "https://www.thehindu.com/news/eci-deepfakes", domain: "thehindu.com", authorityScore: 40 },
      { jinaKey: "test-jina" },
      true,
      { EXTRACTION_API_MODE: "high_value_only" },
    ),
    true,
  );
  assert.equal(
    shouldCallPaidExtractors(
      { title: "Mid authority explainer", url: "https://example.com/mid", domain: "example.com", authorityScore: 55 },
      { jinaKey: "test-jina" },
      true,
      { EXTRACTION_API_MODE: "high_value_only" },
    ),
    true,
  );
  assert.equal(
    shouldCallPaidExtractors(
      { title: "Low blog", url: "https://example.com/low", domain: "example.com", authorityScore: 35 },
      { jinaKey: "test-jina" },
      true,
      { EXTRACTION_API_MODE: "high_value_only" },
    ),
    true,
  );
  assert.equal(
    shouldCallPaidExtractors(
      { title: "Low blog no jina", url: "https://example.com/low2", domain: "example.com", authorityScore: 35 },
      {},
      true,
      { EXTRACTION_API_MODE: "high_value_only" },
    ),
    false,
  );
});

test("high_value_only calls API path for gov domain when local fails", async () => {
  await withEnv({ EXTRACTION_API_MODE: "high_value_only", LOCAL_EXTRACTOR_FIRST: "true" }, async () => {
    let apiHits = 0;
    const paidText = "Supreme Court held that Article 21 privacy requires proportionality and procedural safeguards in democratic India. ".repeat(20);
    const fetchFn = (async (url: string | URL | Request) => {
      const href = String(url);
      if (/r.jina.ai|jina/i.test(href)) {
        apiHits += 1;
        return new Response(paidText, {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
      if (/firecrawl|scraperapi|zenrows|scrapingbee|geekflare/i.test(href)) {
        apiHits += 1;
        return new Response(JSON.stringify({ data: { markdown: paidText, content: paidText } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      // Local webpage fetch fails
      return new Response("error", { status: 500 });
    }) as typeof fetch;

    const enriched = await enrichSource({
      title: "SCI privacy",
      url: "https://main.sci.gov.in/privacy-judgment",
      domain: "main.sci.gov.in",
      snippet,
      authorityScore: 40,
    }, {
      jinaKey: "test-jina-key",
      fetchFn,
      useCache: false,
      query: "Supreme Court Article 21 privacy",
    });

    assert.ok(apiHits >= 1, `expected paid extractor call, got ${apiHits}`);
    assert.notEqual(enriched.extractionMethod, "failed");
    assert.ok(
      enriched.extractionMethod === "jina_reader"
      || enriched.extractionMethod === "readability_fetch"
      || enriched.extractionMethod === "snippet_fallback"
      || Boolean(enriched.fullText),
      `unexpected method=${enriched.extractionMethod}`,
    );
  });
});

test("high-value thin paid extract retries Tier-2 wayback before accepting weak text", async () => {
  await withEnv({
    EXTRACTION_API_MODE: "high_value_only",
    // Skip local-first so the thin Jina hit is what triggers post-paid Tier-2.
    LOCAL_EXTRACTOR_FIRST: "false",
    LOCAL_HEADLESS_EXTRACT: "false",
  }, async () => {
    const waybackBody = (
      "Election Commission of India directed platforms to take down unlawful synthetic political content "
      + "within three hours and required parties to label AI-generated campaign material. "
    ).repeat(8);
    let waybackHits = 0;
    const fetchFn = (async (url: string | URL | Request) => {
      const href = String(url);
      if (/r.jina.ai|jina/i.test(href)) {
        return new Response("ECI press note", { status: 200, headers: { "content-type": "text/plain" } });
      }
      return new Response("forbidden", { status: 403 });
    }) as typeof fetch;

    const enriched = await enrichSource({
      title: "ECI deepfake directions",
      url: "https://pib.gov.in/PressReleasePage.aspx?PRID=999",
      domain: "pib.gov.in",
      snippet: "ECI press note on synthetic content removal within three hours.",
      authorityScore: 80,
    }, {
      jinaKey: "test-jina-key",
      fetchFn,
      useCache: false,
      query: "Election Commission deepfake synthetic content",
      tier2Overrides: {
        extractWayback: async (url) => {
          waybackHits += 1;
          return {
            url,
            text: waybackBody,
            extractionMethod: "wayback_fetch",
            extractionStatus: "success",
          };
        },
      },
    });

    assert.ok(waybackHits >= 1, `expected post-paid Tier-2 wayback, got ${waybackHits}`);
    assert.equal(enriched.extractionMethod, "wayback_fetch");
    assert.ok((enriched.fullText ?? "").length >= 300);
  });
});

test("mid-tier: Tier-2 wayback is deferred until after paid miss", async () => {
  await withEnv({
    EXTRACTION_API_MODE: "high_value_only",
    LOCAL_EXTRACTOR_FIRST: "true",
    LOCAL_HEADLESS_EXTRACT: "false",
  }, async () => {
    const waybackBody = (
      "Platform accountability for synthetic political media requires labeled AI ads and rapid takedown windows. "
    ).repeat(10);
    let waybackHits = 0;
    let jinaHits = 0;
    const fetchFn = (async (url: string | URL | Request) => {
      const href = String(url);
      if (/r.jina.ai|jina/i.test(href)) {
        jinaHits += 1;
        return new Response("thin blurb", { status: 200, headers: { "content-type": "text/plain" } });
      }
      return new Response("forbidden", { status: 403 });
    }) as typeof fetch;

    const enriched = await enrichSource({
      title: "Op-ed on synthetic media",
      url: "https://example.com/synthetic-media-policy",
      domain: "example.com",
      snippet: "synthetic political media labeling requirements",
      authorityScore: 40,
    }, {
      jinaKey: "test-jina-key",
      fetchFn,
      useCache: false,
      query: "synthetic political media labeling",
      tier2Overrides: {
        extractWayback: async (url) => {
          waybackHits += 1;
          assert.ok(jinaHits >= 1, "wayback must run after paid miss, not before Jina");
          return {
            url,
            text: waybackBody,
            extractionMethod: "wayback_fetch",
            extractionStatus: "success",
          };
        },
      },
    });

    assert.ok(jinaHits >= 1, `expected Jina call, got ${jinaHits}`);
    assert.ok(waybackHits >= 1, `expected deferred Tier-2 wayback, got ${waybackHits}`);
    assert.equal(enriched.extractionMethod, "wayback_fetch");
  });
});

test("high-value snippet_fallback cache hits are skipped so enrich retries", async () => {
  await withEnv({ EXTRACTION_API_MODE: "never", LOCAL_EXTRACTOR_FIRST: "true" }, async () => {
    const { CacheManager } = await import("../../../src/services/cache-manager.js");
    const { enrichmentCacheKey } = await import("../../../src/core/retrieval/enrichment/enrichment-cache.js");
    const cache = new CacheManager();
    const url = "https://eci.gov.in/guidelines/ai-content";
    const query = "Election Commission AI content guidelines";
    const poisoned = {
      title: "ECI guidelines",
      url,
      domain: "eci.gov.in",
      fullText: "short snip",
      snippet: "short snip",
      textLength: 10,
      extractionMethod: "snippet_fallback" as const,
      extractionStatus: "partial" as const,
      extractionQuality: "medium" as const,
      citationEligible: true,
      citationStrength: "weak" as const,
      limitedSource: true,
    };
    cache.set("enrichment", enrichmentCacheKey(url, query), poisoned);

    const article = (
      "The Election Commission issued platform take-down timelines and labelling duties for synthetic "
      + "political advertising across notified election periods in India. "
    ).repeat(10);
    const fetchFn = (async () => new Response(
      `<html><article><p>${article}</p></article></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    )) as typeof fetch;

    const enriched = await enrichSource({
      title: "ECI guidelines",
      url,
      domain: "eci.gov.in",
      snippet: "short snip",
      authorityScore: 80,
    }, {
      cache,
      useCache: true,
      fetchFn,
      query,
    });

    assert.notEqual(enriched.extractionMethod, "snippet_fallback");
    assert.ok((enriched.fullText ?? "").length > 100);
  });
});

test("mid-tier snippet_fallback cache hits are skipped so enrich retries", async () => {
  await withEnv({ EXTRACTION_API_MODE: "never", LOCAL_EXTRACTOR_FIRST: "true" }, async () => {
    const { CacheManager } = await import("../../../src/services/cache-manager.js");
    const { enrichmentCacheKey } = await import("../../../src/core/retrieval/enrichment/enrichment-cache.js");
    const cache = new CacheManager();
    const url = "https://timesofindia.indiatimes.com/india/ec-ai-ads";
    const query = "EC AI generated poll ads labelled";
    const poisoned = {
      title: "TOI EC AI ads",
      url,
      domain: "timesofindia.indiatimes.com",
      fullText: "seo snip only",
      snippet: "seo snip only",
      textLength: 13,
      extractionMethod: "snippet_fallback" as const,
      extractionStatus: "partial" as const,
      extractionQuality: "medium" as const,
      citationEligible: true,
      citationStrength: "weak" as const,
      limitedSource: true,
    };
    cache.set("enrichment", enrichmentCacheKey(url, query), poisoned);

    const article = (
      "The Election Commission directed that all AI-generated political advertisements must be clearly labelled "
      + "so voters can distinguish synthetic campaign content during the notified election period in India. "
    ).repeat(8);
    const fetchFn = (async () => new Response(
      `<html><article><p>${article}</p></article></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    )) as typeof fetch;

    const enriched = await enrichSource({
      title: "TOI EC AI ads",
      url,
      domain: "timesofindia.indiatimes.com",
      snippet: "seo snip only",
      authorityScore: 35,
    }, {
      cache,
      useCache: true,
      fetchFn,
      query,
    });

    assert.notEqual(enriched.extractionMethod, "snippet_fallback");
    assert.ok((enriched.fullText ?? "").length > 100);
  });
});

test("mid-tier paid snippet_fallback keeps partial local body when SEO snippet is longer", async () => {
  await withEnv({
    EXTRACTION_API_MODE: "high_value_only",
    LOCAL_EXTRACTOR_FIRST: "true",
    LOCAL_HEADLESS_EXTRACT: "false",
  }, async () => {
    const localBody = (
      "State election regulators published guidance on disclosure of political ad spend and "
      + "targeting metadata for intermediaries operating during the Model Code of Conduct."
    );
    assert.ok(localBody.length >= 120 && localBody.length < 300);
    const longSnippet = ("SEO fluff about elections and platforms " ).repeat(12).trim();
    assert.ok(longSnippet.length > localBody.length);

    const fetchFn = (async (url: string | URL | Request) => {
      const href = String(url);
      if (/r.jina.ai|jina|firecrawl|scraperapi|zenrows|scrapingbee|geekflare|archive\.org/i.test(href)) {
        // Paid/archive miss → snippet path; local HTML is the only real body.
        return new Response("blocked", { status: 403 });
      }
      return new Response(
        `<html><article><p>${localBody}</p></article></html>`,
        { status: 200, headers: { "content-type": "text/html" } },
      );
    }) as typeof fetch;

    const enriched = await enrichSource({
      title: "Platform ad spend note",
      url: "https://notesheet.in/eci-ad-spend-guidance",
      domain: "notesheet.in",
      snippet: longSnippet,
      authorityScore: 20,
    }, {
      jinaKey: "test-jina-key",
      fetchFn,
      useCache: false,
      query: "political ad spend disclosure Model Code",
      tier2Overrides: {
        extractWayback: async (url) => ({
          url,
          text: null,
          extractionMethod: "failed",
          extractionStatus: "failed",
          error: "no snapshot",
        }),
      },
    });

    assert.equal(enriched.extractionMethod, "readability_fetch");
    assert.notEqual(enriched.extractionMethod, "snippet_fallback");
    assert.ok((enriched.fullText ?? "").includes("Model Code"));
  });
});
