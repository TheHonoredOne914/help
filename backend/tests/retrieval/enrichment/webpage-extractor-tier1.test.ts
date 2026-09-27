import test from "node:test";
import assert from "node:assert/strict";
import {
  LOCAL_FETCH_HEADERS,
  collectSafeUrlVariants,
  extract,
  extractBestMainContent,
  extractFromMainContentSelectors,
  printUrlVariant,
} from "../../../src/core/retrieval/enrichment/extractors/webpage-extractor.js";

const ARTICLE_BODY = (
  "The Supreme Court of India clarified that democratic accountability requires transparent electoral funding "
  + "and proportionate privacy safeguards under Article 21. Parliament must ensure independent oversight while "
  + "preserving free speech and federal balance across states. Civil society groups welcomed the emphasis on "
  + "evidence-based policymaking and open data for voters. "
).repeat(3);

const NEWS_HTML = `<!doctype html>
<html><head><title>Election funding ruling</title></head>
<body>
  <nav>Home Politics Sports</nav>
  <header>News Site Branding Subscribe Now</header>
  <article>
    <h1>Court stresses transparent electoral funding</h1>
    <p>${ARTICLE_BODY}</p>
  </article>
  <aside>Related ads and trending videos</aside>
  <footer>Copyright 2026</footer>
</body></html>`;

const JS_SHELL_HTML = `<!doctype html>
<html><head><title>App Shell</title></head>
<body>
  <div id="root">You need to enable JavaScript to run this app.</div>
  <noscript>Please enable JavaScript to continue.</noscript>
</body></html>`;

const GOV_HTML = `<!doctype html>
<html><head><title>PIB Release</title></head>
<body>
  <div class="header">Government of India</div>
  <div id="mainContent" class="main-content">
    <h1>Press Information Bureau release</h1>
    <p>${ARTICLE_BODY}</p>
    <p>Ministry officials said implementation timelines will be published on the portal with monthly updates.</p>
  </div>
  <div class="sidebar">Quick links Forms RTI</div>
</body></html>`;

const SHORT_HTML = `<!doctype html>
<html><body><main><p>Too short.</p></main></body></html>`;

test("extractBestMainContent prefers article body on news fixture", () => {
  const text = extractBestMainContent(NEWS_HTML);
  assert.ok(text, "expected article text");
  assert.match(text!, /Supreme Court of India/);
  assert.match(text!, /transparent electoral funding/);
  assert.ok(text!.length > 300);
  assert.ok(!/Subscribe Now/.test(text!) || text!.includes("Court stresses"));
});

test("extractBestMainContent rejects JS evidence shells", () => {
  const text = extractBestMainContent(JS_SHELL_HTML);
  assert.equal(text, null);
});

test("gov-like #mainContent / .main-content selectors yield body text", () => {
  const fromSelectors = extractFromMainContentSelectors(GOV_HTML);
  assert.ok(fromSelectors);
  assert.match(fromSelectors!, /Press Information Bureau|Supreme Court of India/);
  const best = extractBestMainContent(GOV_HTML);
  assert.ok(best);
  assert.match(best!, /Ministry officials said implementation/);
  assert.ok(best!.length > 300);
});

test("short pages do not produce strong main content", () => {
  const text = extractBestMainContent(SHORT_HTML);
  assert.equal(text, null);
});

test("collectSafeUrlVariants yields AMP and print patterns", () => {
  const variants = collectSafeUrlVariants("https://www.example.com/news/story-1");
  assert.ok(variants.some((v) => v.includes("amp.example.com")));
  assert.ok(variants.some((v) => /[?&]print=1\b/.test(v)));
  assert.ok(variants.length <= 2);
  assert.equal(printUrlVariant("https://example.com/a?print=1"), null);
});

test("fetch init includes browser-like headers; AMP variant used when primary is shell", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const ampBody = `<!doctype html><html><body><article><p>${ARTICLE_BODY}</p></article></body></html>`;

  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const href = String(input);
    calls.push({ url: href, init });
    if (href.includes("amp.")) {
      return new Response(ampBody, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return new Response(JS_SHELL_HTML, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }) as typeof fetch;

  const result = await extract("https://www.news.example/politics/funding", { fetchFn, timeoutMs: 5000 });

  assert.ok(calls.length >= 2, `expected primary + variant fetch, got ${calls.length}`);
  const headerBag = calls[0]?.init?.headers as Record<string, string> | undefined;
  assert.ok(headerBag, "expected headers on fetch init");
  assert.match(String(headerBag["User-Agent"] ?? headerBag["user-agent"] ?? ""), /BestDelResearchCrawler|Chrome\/128/);
  assert.equal(headerBag["Accept-Language"] ?? headerBag["accept-language"], LOCAL_FETCH_HEADERS["Accept-Language"]);
  assert.ok(String(headerBag.Accept ?? headerBag.accept ?? "").includes("text/html"));
  assert.ok(result.text && result.text.length > 300);
  assert.match(result.text!, /Supreme Court of India/);
  assert.ok(calls.some((c) => c.url.includes("amp.")), "expected AMP URL variant retry");
});

test("strong primary extract does not fan out to variants", async () => {
  let calls = 0;
  const fetchFn = (async () => {
    calls += 1;
    return new Response(NEWS_HTML, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  }) as typeof fetch;

  const result = await extract("https://www.example.com/article/good", { fetchFn });
  assert.equal(calls, 1);
  assert.ok(result.text && result.text.length > 300);
});
