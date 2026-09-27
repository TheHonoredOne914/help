import type { Browser } from "playwright";
import { assertSafeSourceFetchUrl } from "../../../security/source-url-policy.js";
import { isEvidenceShell } from "../source-quality.js";
import type { ExtractorOptions, ExtractorResult } from "../types.js";
import { extractBestMainContent, LOCAL_FETCH_HEADERS } from "./webpage-extractor.js";

const MAX_TEXT_CHARS = 20_000;
const DEFAULT_TIMEOUT_MS = 25_000;
/** Default post-load settle; site-aware paths use longer windows. */
const DEFAULT_SETTLE_MS = 2_500;
/** Treat readability/main extracts below this as weak and try body innerText. */
const SHORT_CONTENT_CHARS = 300;

const PIB_CONTENT_SELECTORS = [
  "#ministrycontent",
  ".innner-page",
  ".ReleaseMainContent",
  "article",
  "#content",
] as const;

const ECI_CONTENT_SELECTORS = [
  "main",
  "#main-content",
  ".home-page",
  "body",
] as const;

export type HeadlessPage = {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  content(): Promise<string>;
  close(): Promise<void>;
  setExtraHTTPHeaders?(headers: Record<string, string>): Promise<void>;
  waitForSelector?(selector: string, options?: Record<string, unknown>): Promise<unknown>;
  waitForLoadState?(state?: "load" | "domcontentloaded" | "networkidle", options?: Record<string, unknown>): Promise<unknown>;
  evaluate?<T>(pageFunction: () => T): Promise<T>;
};

export type HeadlessBrowser = {
  newPage(): Promise<HeadlessPage>;
  close(): Promise<void>;
};

export type HeadlessExtractorOptions = ExtractorOptions & {
  /** Test seam: return HTML without launching Playwright. */
  renderHtml?: (url: string) => Promise<string>;
  /** Test seam: optional body innerText alongside renderHtml. */
  renderBodyText?: (url: string) => Promise<string>;
  /** Test seam: supply a browser factory instead of playwright.chromium. */
  launchBrowser?: () => Promise<HeadlessBrowser>;
};

export type HeadlessRenderResult = {
  html: string;
  bodyText?: string;
};

/** Host helpers exported for unit tests. */
export function isPibHost(hostname: string): boolean {
  return hostname.toLowerCase().includes("pib.gov.in");
}

export function isEciHost(hostname: string): boolean {
  return hostname.toLowerCase().includes("eci.gov.in");
}

export function cleanBodyInnerText(raw: string | null | undefined): string | null {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (isEvidenceShell(text)) return null;
  return text;
}

export function isWeakMainContent(text: string | null | undefined): boolean {
  if (!text) return true;
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return true;
  if (isEvidenceShell(trimmed)) return true;
  return trimmed.length < SHORT_CONTENT_CHARS;
}

export function isLocalHeadlessExtractEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.LOCAL_HEADLESS_EXTRACT ?? "false").trim().toLowerCase() === "true";
}

export function getLocalHeadlessTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.LOCAL_HEADLESS_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.floor(raw), 120_000);
}

/**
 * Opt-in Chromium render for public pages that block plain fetch (403) or ship JS shells.
 * Soft-fails when Playwright / Chromium is unavailable so the pipeline never crashes.
 */
export async function extractHeadlessWebpage(
  url: string,
  options: HeadlessExtractorOptions = {},
): Promise<ExtractorResult> {
  const timeoutMs = options.timeoutMs ?? getLocalHeadlessTimeoutMs();
  let safeUrl: URL;
  try {
    safeUrl = await assertSafeSourceFetchUrl(url, {
      resolveDns: !options.renderHtml && !options.launchBrowser && !options.fetchFn,
    });
  } catch (error) {
    return failed(url, error instanceof Error ? error.message : String(error));
  }

  try {
    const rendered = options.renderHtml
      ? await renderViaSeam(safeUrl.href, timeoutMs, options)
      : await renderWithPlaywright(safeUrl.href, timeoutMs, options);

    const html = rendered.html;
    if (!html?.trim()) {
      return {
        url: safeUrl.href,
        text: null,
        html: html ?? null,
        extractionMethod: "headless_fetch",
        extractionStatus: "partial",
        error: "headless render returned empty HTML",
      };
    }

    let text = extractBestMainContent(html);
    if (isWeakMainContent(text)) {
      const bodyFallback = cleanBodyInnerText(rendered.bodyText);
      if (bodyFallback && !isWeakMainContent(bodyFallback)) {
        text = bodyFallback;
      } else if (bodyFallback && (!text || isEvidenceShell(text) || bodyFallback.length > text.length)) {
        text = bodyFallback;
      }
    }

    if (!text || isEvidenceShell(text)) {
      return {
        url: safeUrl.href,
        text: null,
        html,
        extractionMethod: "headless_fetch",
        extractionStatus: "partial",
        error: text
          ? "headless render still looks like an evidence shell"
          : "headless render produced no main content",
      };
    }

    return {
      url: safeUrl.href,
      text: text.slice(0, MAX_TEXT_CHARS),
      html,
      extractionMethod: "headless_fetch",
      extractionStatus: "success",
    };
  } catch (error) {
    return failed(safeUrl.href, error instanceof Error ? error.message : String(error));
  }
}

async function renderViaSeam(
  url: string,
  timeoutMs: number,
  options: HeadlessExtractorOptions,
): Promise<HeadlessRenderResult> {
  const html = await withTimeout(options.renderHtml!(url), timeoutMs, options.abortSignal);
  let bodyText: string | undefined;
  if (options.renderBodyText) {
    try {
      bodyText = await withTimeout(options.renderBodyText(url), timeoutMs, options.abortSignal);
    } catch {
      bodyText = undefined;
    }
  }
  return { html, bodyText };
}

async function renderWithPlaywright(
  url: string,
  timeoutMs: number,
  options: HeadlessExtractorOptions,
): Promise<HeadlessRenderResult> {
  const browser = options.launchBrowser
    ? await options.launchBrowser()
    : await launchPlaywrightChromium();

  let page: HeadlessPage | null = null;
  try {
    page = await browser.newPage();
    if (page.setExtraHTTPHeaders) {
      await page.setExtraHTTPHeaders({
        "Accept-Language": LOCAL_FETCH_HEADERS["Accept-Language"],
        Accept: LOCAL_FETCH_HEADERS.Accept,
      });
    }
    await withTimeout(
      page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      }),
      timeoutMs + 2_000,
      options.abortSignal,
    );
    await settleAfterGoto(page, url, timeoutMs);
    const html = await page.content();
    let bodyText: string | undefined;
    if (page.evaluate) {
      try {
        bodyText = await page.evaluate(() => {
          return (typeof document !== "undefined" && document.body && document.body.innerText) || "";
        });
      } catch {
        bodyText = undefined;
      }
    }
    return { html, bodyText };
  } finally {
    try { await page?.close(); } catch { /* ignore */ }
    try { await browser.close(); } catch { /* ignore */ }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * Site-aware post-navigation waits. Soft-fails per selector so missing DOM never aborts extract.
 */
export async function settleAfterGoto(
  page: HeadlessPage,
  url: string,
  timeoutMs: number,
): Promise<{ hostKind: "pib" | "eci" | "default"; selectorsTried: string[] }> {
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = "";
  }

  const selectorsTried: string[] = [];
  const perSelectorTimeout = Math.min(5_000, Math.max(1_500, Math.floor(timeoutMs / 6)));

  if (isPibHost(hostname)) {
    for (const selector of PIB_CONTENT_SELECTORS) {
      selectorsTried.push(selector);
      try {
        await page.waitForSelector?.(selector, { timeout: perSelectorTimeout, state: "attached" });
      } catch {
        /* soft: try next */
      }
    }
    await sleep(Math.min(3_000, Math.max(2_000, Math.floor(timeoutMs / 12))));
    return { hostKind: "pib", selectorsTried };
  }

  if (isEciHost(hostname)) {
    if (page.waitForLoadState && timeoutMs >= 8_000) {
      try {
        await page.waitForLoadState("networkidle", {
          timeout: Math.min(12_000, Math.floor(timeoutMs * 0.45)),
        });
      } catch {
        /* soft */
      }
    }
    for (const selector of ECI_CONTENT_SELECTORS) {
      selectorsTried.push(selector);
      try {
        await page.waitForSelector?.(selector, { timeout: perSelectorTimeout, state: "attached" });
      } catch {
        /* soft */
      }
    }
    await sleep(Math.min(5_000, Math.max(3_000, Math.floor(timeoutMs / 8))));
    return { hostKind: "eci", selectorsTried };
  }

  await sleep(Math.min(DEFAULT_SETTLE_MS + 500, Math.max(DEFAULT_SETTLE_MS, Math.floor(timeoutMs / 10))));
  return { hostKind: "default", selectorsTried };
}

function wrapBrowserWithChromeUa(browser: Browser): HeadlessBrowser {
  return {
    async newPage(): Promise<HeadlessPage> {
      const context = await browser.newContext({
        userAgent: LOCAL_FETCH_HEADERS["User-Agent"],
        locale: "en-IN",
        extraHTTPHeaders: {
          "Accept-Language": LOCAL_FETCH_HEADERS["Accept-Language"],
          Accept: LOCAL_FETCH_HEADERS.Accept,
        },
      });
      const page = await context.newPage();
      return {
        goto: (u, o) => page.goto(u, o),
        content: () => page.content(),
        setExtraHTTPHeaders: (h) => page.setExtraHTTPHeaders(h),
        waitForSelector: (s, o) => page.waitForSelector(s, o),
        waitForLoadState: (state, o) => page.waitForLoadState(state, o),
        evaluate: (fn) => page.evaluate(fn),
        async close() {
          try { await page.close(); } catch { /* ignore */ }
          try { await context.close(); } catch { /* ignore */ }
        },
      };
    },
    async close() {
      await browser.close();
    },
  };
}

async function launchPlaywrightChromium(): Promise<HeadlessBrowser> {
  let playwrightMod: typeof import("playwright");
  try {
    playwrightMod = await import("playwright");
  } catch {
    throw new Error(
      "Playwright is not installed. Enable LOCAL_HEADLESS_EXTRACT only after: npm i playwright && npx playwright install chromium",
    );
  }
  try {
    const browser = await playwrightMod.chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage", "--no-sandbox"],
    });
    return wrapBrowserWithChromeUa(browser);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error("Playwright Chromium failed to launch (" + msg + "). Run: npx playwright install chromium");
  }
}

function failed(url: string, error: string): ExtractorResult {
  return {
    url,
    text: null,
    html: null,
    extractionMethod: "failed",
    extractionStatus: "failed",
    error: "headless extract failed: " + error,
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  abortSignal?: AbortSignal,
): Promise<T> {
  if (abortSignal?.aborted) throw new Error("headless extract aborted");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("headless extract timed out after " + timeoutMs + "ms")),
          timeoutMs,
        );
        if (abortSignal) {
          onAbort = () => reject(new Error("headless extract aborted"));
          abortSignal.addEventListener("abort", onAbort, { once: true });
        }
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (abortSignal && onAbort) abortSignal.removeEventListener("abort", onAbort);
  }
}
