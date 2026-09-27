import test from "node:test";
import assert from "node:assert/strict";
import {
  isLocalHeadlessExtractEnabled,
  getLocalHeadlessTimeoutMs,
  extractHeadlessWebpage,
  settleAfterGoto,
  isPibHost,
  isEciHost,
  isWeakMainContent,
  cleanBodyInnerText,
  type HeadlessPage,
} from "../../../src/core/retrieval/enrichment/extractors/headless-webpage-extractor.js";
import {
  isBotBlockOrChallengeError,
  isUsableLocalExtract,
  shouldAttemptTier2Recovery,
  shouldRunHeadlessForUrl,
  recoverLocalExtractionTier2,
} from "../../../src/core/retrieval/enrichment/extractors/local-tier2-recovery.js";
import type { ExtractorResult } from "../../../src/core/retrieval/enrichment/types.js";

const ARTICLE = (
  "The Election Commission of India outlined voter registration timelines and constituency delimitation notes "
  + "for the upcoming cycle. Officials emphasized transparent roll revision and public inspection windows "
  + "across states and union territories with documented grievance redressal. "
).repeat(4);

const ARTICLE_HTML = `<!doctype html><html><body><article><h1>ECI update</h1><p>${ARTICLE}</p></article></body></html>`;
const SHELL_HTML = `<!doctype html><html><body><div id="root">You need to enable JavaScript to run this app.</div></body></html>`;

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

function failed403(url = "https://pib.gov.in/PressRelease.aspx"): ExtractorResult {
  return {
    url,
    text: null,
    extractionMethod: "failed",
    extractionStatus: "failed",
    error: "readability fetch failed: 403",
  };
}

function shellPartial(url = "https://www.eci.gov.in/"): ExtractorResult {
  return {
    url,
    text: "You need to enable JavaScript to run this app.",
    html: SHELL_HTML,
    extractionMethod: "readability_fetch",
    extractionStatus: "partial",
  };
}

test("LOCAL_HEADLESS_EXTRACT defaults false and timeout parses", () => {
  assert.equal(isLocalHeadlessExtractEnabled({}), false);
  assert.equal(isLocalHeadlessExtractEnabled({ LOCAL_HEADLESS_EXTRACT: "true" }), true);
  assert.equal(getLocalHeadlessTimeoutMs({}), 25000);
  assert.equal(getLocalHeadlessTimeoutMs({ LOCAL_HEADLESS_TIMEOUT_MS: "12000" }), 12000);
});

test("403/401/429 errors are detected as bot-block triggers", () => {
  assert.equal(isBotBlockOrChallengeError("readability fetch failed: 403"), true);
  assert.equal(isBotBlockOrChallengeError("status 401 unauthorized"), true);
  assert.equal(isBotBlockOrChallengeError("429 too many requests"), true);
  assert.equal(isBotBlockOrChallengeError("readability fetch failed: 500"), false);
});

test("shell and 403 results should attempt Tier 2", () => {
  assert.equal(shouldAttemptTier2Recovery(failed403()), true);
  assert.equal(shouldAttemptTier2Recovery(shellPartial()), true);
  assert.equal(
    shouldAttemptTier2Recovery({
      url: "https://example.com/ok",
      text: ARTICLE,
      extractionMethod: "readability_fetch",
      extractionStatus: "success",
    }),
    false,
  );
});

test("mid-length partial non-shell junk still attempts Tier 2", () => {
  // Previously only bot/shell/short triggered Tier 2; partial extracts ≥300 chars that
  // are not evidence shells skipped recovery and became snippet_fallback after paid miss.
  const partialJunk: ExtractorResult = {
    url: "https://www.thehindu.com/news/national/example",
    text: (
      "Related stories More from this author Trending now Follow us on social media "
      + "Latest updates across politics economy and sports desks around the country. "
    ).repeat(3),
    extractionMethod: "readability_fetch",
    extractionStatus: "partial",
  };
  assert.equal(isUsableLocalExtract(partialJunk), false);
  assert.equal(shouldAttemptTier2Recovery(partialJunk), true);
});

test("shouldRunHeadlessForUrl auto-enables PIB/ECI when global flag is off", () => {
  assert.equal(shouldRunHeadlessForUrl("https://example.com/a", {}, { LOCAL_HEADLESS_EXTRACT: "false" }), false);
  assert.equal(shouldRunHeadlessForUrl("https://pib.gov.in/PressRelease.aspx", {}, { LOCAL_HEADLESS_EXTRACT: "false" }), true);
  assert.equal(shouldRunHeadlessForUrl("https://www.eci.gov.in/voters", {}, { LOCAL_HEADLESS_EXTRACT: "false" }), true);
  assert.equal(
    shouldRunHeadlessForUrl("https://pib.gov.in/PressRelease.aspx", { headlessEnabled: false }, { LOCAL_HEADLESS_EXTRACT: "false" }),
    false,
  );
});

test("shouldRunHeadlessForUrl auto-enables other .gov.in / legal hosts only on bot-block or shell", () => {
  const env = { LOCAL_HEADLESS_EXTRACT: "false" };
  assert.equal(shouldRunHeadlessForUrl("https://www.mha.gov.in/page", {}, env), false);
  assert.equal(
    shouldRunHeadlessForUrl("https://www.mha.gov.in/page", {}, env, { error: "readability fetch failed: 403", text: null }),
    true,
  );
  assert.equal(
    shouldRunHeadlessForUrl("https://adrindia.org/report", {}, env, {
      error: null,
      text: "You need to enable JavaScript to run this app.",
    }),
    true,
  );
  assert.equal(
    shouldRunHeadlessForUrl("https://adrindia.org/report", {}, env, { error: "timeout", text: "short" }),
    false,
  );
});

test("disabled headless flag skips playwright for non-gov hosts but still tries wayback mock", async () => {
  await withEnv({ LOCAL_HEADLESS_EXTRACT: "false" }, async () => {
    let headlessCalls = 0;
    let waybackCalls = 0;
    const recovered = await recoverLocalExtractionTier2(
      "https://www.thehindu.com/news/national/example",
      failed403("https://www.thehindu.com/news/national/example"),
      {},
      {
        extractHeadless: async () => {
          headlessCalls += 1;
          throw new Error("should not run");
        },
        extractWayback: async (url) => {
          waybackCalls += 1;
          return {
            url,
            text: ARTICLE,
            extractionMethod: "wayback_fetch",
            extractionStatus: "success",
          };
        },
      },
    );
    assert.equal(headlessCalls, 0);
    assert.equal(waybackCalls, 1);
    assert.equal(recovered.extractionMethod, "wayback_fetch");
    assert.ok((recovered.text ?? "").length > 300);
  });
});

test("PIB host auto-runs headless even when LOCAL_HEADLESS_EXTRACT is false", async () => {
  await withEnv({ LOCAL_HEADLESS_EXTRACT: "false" }, async () => {
    let headlessCalls = 0;
    let waybackCalls = 0;
    const recovered = await recoverLocalExtractionTier2(
      "https://pib.gov.in/PressRelease.aspx",
      failed403(),
      {},
      {
        extractHeadless: async (url) => {
          headlessCalls += 1;
          return {
            url,
            text: ARTICLE,
            html: ARTICLE_HTML,
            extractionMethod: "headless_fetch",
            extractionStatus: "success",
          };
        },
        extractWayback: async () => {
          waybackCalls += 1;
          throw new Error("should not run when headless succeeds");
        },
      },
    );
    assert.equal(headlessCalls, 1);
    assert.equal(waybackCalls, 0);
    assert.equal(recovered.extractionMethod, "headless_fetch");
  });
});

test("enabled headless path used for 403 before wayback", async () => {
  await withEnv({ LOCAL_HEADLESS_EXTRACT: "true" }, async () => {
    let headlessCalls = 0;
    let waybackCalls = 0;
    const recovered = await recoverLocalExtractionTier2(
      "https://pib.gov.in/PressRelease.aspx",
      failed403(),
      {},
      {
        headlessEnabled: true,
        extractHeadless: async (url) => {
          headlessCalls += 1;
          return {
            url,
            text: ARTICLE,
            html: ARTICLE_HTML,
            extractionMethod: "headless_fetch",
            extractionStatus: "success",
          };
        },
        extractWayback: async () => {
          waybackCalls += 1;
          throw new Error("should not run when headless succeeds");
        },
      },
    );
    assert.equal(headlessCalls, 1);
    assert.equal(waybackCalls, 0);
    assert.equal(recovered.extractionMethod, "headless_fetch");
  });
});

test("shell trigger prefers headless when enabled then falls back to wayback", async () => {
  const recovered = await recoverLocalExtractionTier2(
    "https://www.eci.gov.in/",
    shellPartial(),
    {},
    {
      headlessEnabled: true,
      extractHeadless: async (url) => ({
        url,
        text: null,
        html: SHELL_HTML,
        extractionMethod: "headless_fetch",
        extractionStatus: "partial",
        error: "still shell",
      }),
      extractWayback: async (url) => ({
        url,
        text: ARTICLE,
        extractionMethod: "wayback_fetch",
        extractionStatus: "success",
      }),
    },
  );
  assert.equal(recovered.extractionMethod, "wayback_fetch");
  assert.ok((recovered.text ?? "").includes("Election Commission"));
});

test("extractHeadlessWebpage uses renderHtml seam and rejects shells", async () => {
  const ok = await extractHeadlessWebpage("https://www.eci.gov.in/news", {
    renderHtml: async () => ARTICLE_HTML,
    timeoutMs: 5000,
  });
  assert.equal(ok.extractionMethod, "headless_fetch");
  assert.equal(ok.extractionStatus, "success");
  assert.ok((ok.text ?? "").length > 300);

  const shell = await extractHeadlessWebpage("https://www.eci.gov.in/", {
    renderHtml: async () => SHELL_HTML,
    timeoutMs: 5000,
  });
  assert.equal(shell.extractionStatus, "partial");
  assert.equal(shell.text, null);
});

test("wayback availability mock path extracts snapshot HTML", async () => {
  const { extractWaybackWebpage } = await import(
    "../../../src/core/retrieval/enrichment/extractors/wayback-webpage-extractor.js"
  );
  const original = "https://pib.gov.in/PressReleasePage.aspx?PRID=123";
  const snapshot = "https://web.archive.org/web/20260101000000/https://pib.gov.in/PressReleasePage.aspx?PRID=123";
  const fetchFn = (async (input: string | URL | Request) => {
    const href = String(input);
    if (href.includes("archive.org/wayback/available")) {
      return new Response(JSON.stringify({
        archived_snapshots: { closest: { available: true, url: snapshot } },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (href.includes("web.archive.org")) {
      return new Response(ARTICLE_HTML, { status: 200, headers: { "content-type": "text/html" } });
    }
    return new Response("nope", { status: 404 });
  }) as typeof fetch;

  const result = await extractWaybackWebpage(original, { fetchFn, timeoutMs: 5000 });
  assert.equal(result.extractionMethod, "wayback_fetch");
  assert.equal(result.extractionStatus, "success");
  assert.ok((result.text ?? "").includes("Election Commission"));
});

test("host helpers detect PIB and ECI", () => {
  assert.equal(isPibHost("www.pib.gov.in"), true);
  assert.equal(isPibHost("pib.gov.in"), true);
  assert.equal(isEciHost("www.eci.gov.in"), true);
  assert.equal(isEciHost("eci.gov.in"), true);
  assert.equal(isPibHost("example.com"), false);
  assert.equal(isWeakMainContent("short"), true);
  assert.equal(cleanBodyInnerText("You need to enable JavaScript to run this app."), null);
});

test("settleAfterGoto tries PIB selectors soft-fail", async () => {
  const waited: string[] = [];
  const page: HeadlessPage = {
    async goto() {},
    async content() { return ""; },
    async close() {},
    async waitForSelector(selector: string) {
      waited.push(selector);
      throw new Error("not found: " + selector);
    },
  };
  const result = await settleAfterGoto(page, "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2087859", 12000);
  assert.equal(result.hostKind, "pib");
  assert.ok(result.selectorsTried.includes("#ministrycontent"));
  assert.ok(result.selectorsTried.includes(".innner-page"));
  assert.ok(result.selectorsTried.includes(".ReleaseMainContent"));
  assert.deepEqual(waited, result.selectorsTried);
});

test("settleAfterGoto tries ECI selectors and networkidle", async () => {
  const waited: string[] = [];
  let networkIdle = false;
  const page: HeadlessPage = {
    async goto() {},
    async content() { return ""; },
    async close() {},
    async waitForLoadState(state: string) {
      if (state === "networkidle") networkIdle = true;
    },
    async waitForSelector(selector: string) {
      waited.push(selector);
    },
  };
  const result = await settleAfterGoto(page, "https://www.eci.gov.in/", 20000);
  assert.equal(result.hostKind, "eci");
  assert.equal(networkIdle, true);
  assert.ok(result.selectorsTried.includes("main"));
  assert.ok(result.selectorsTried.includes("#main-content"));
  assert.ok(waited.includes("body"));
});

test("body-text fallback used when readability/main content is short", async () => {
  const shortHtml = "<!doctype html><html><body><div id=\"root\">Short shell nav.</div></body></html>";
  const longBody = (
    "The Election Commission of India published detailed guidance on electoral roll revision, "
    + "public inspection windows, and grievance redressal across states and union territories. "
  ).repeat(6);
  const result = await extractHeadlessWebpage("https://www.eci.gov.in/news", {
    renderHtml: async () => shortHtml,
    renderBodyText: async () => longBody,
    timeoutMs: 5000,
  });
  assert.equal(result.extractionMethod, "headless_fetch");
  assert.equal(result.extractionStatus, "success");
  assert.ok((result.text ?? "").length >= 300);
  assert.ok((result.text ?? "").includes("Election Commission"));
});

test("mocked launchBrowser path uses evaluate body fallback", async () => {
  const shortHtml = "<!doctype html><html><body><p>tiny</p></body></html>";
  const longBody = (
    "Press Information Bureau released an official note covering cabinet decisions, "
    + "ministry statements, and implementation timelines for the notified scheme. "
  ).repeat(5);
  let evaluated = false;
  const page: HeadlessPage = {
    async goto() {},
    async content() { return shortHtml; },
    async close() {},
    async waitForSelector() {},
    async evaluate() {
      evaluated = true;
      return longBody as never;
    },
  };
  const result = await extractHeadlessWebpage("https://pib.gov.in/PressReleasePage.aspx?PRID=2087859", {
    timeoutMs: 8000,
    launchBrowser: async () => ({
      async newPage() { return page; },
      async close() {},
    }),
  });
  assert.equal(evaluated, true);
  assert.equal(result.extractionStatus, "success");
  assert.ok((result.text ?? "").includes("Press Information Bureau"));
});
