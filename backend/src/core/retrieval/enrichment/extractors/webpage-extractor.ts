import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { assertSafeSourceFetchUrl } from "../../../security/source-url-policy.js";
import { ampUrlVariant } from "../../../search/search-fallback-policy.js";
import { isEvidenceShell } from "../source-quality.js";
import type { ExtractorOptions, ExtractorResult } from "../types.js";

/** Browser-like headers for local webpage/PDF fetch (Tier 1). No Playwright. */
export const LOCAL_FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 BestDelResearchCrawler/1.0",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.7",
  "Accept-Language": "en-IN,en;q=0.9",
  // identity keeps byte-bounded reads predictable for Node fetch
  "Accept-Encoding": "identity",
  "Cache-Control": "no-cache",
};

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 20_000;
const MIN_STRATEGY_CHARS = 120;
const WEAK_EXTRACT_CHARS = 300;
const MAX_URL_VARIANTS = 2;

const MAIN_CONTENT_SELECTORS = [
  "article",
  "main",
  "[role=\"main\"]",
  "#content",
  ".content",
  "#mainContent",
  "#main-content",
  ".main-content",
  "#MainContent",
  ".entry-content",
  ".post-content",
  ".article-body",
  ".story-body",
  "#main",
  ".main",
] as const;

export async function extract(url: string, options: ExtractorOptions = {}): Promise<ExtractorResult> {
  const primary = await extractOnce(url, options);
  if (isStrongLocalExtract(primary)) return primary;

  let best = primary;
  const variants = collectSafeUrlVariants(url).slice(0, MAX_URL_VARIANTS);
  for (const variant of variants) {
    try {
      const attempt = await extractOnce(variant, options);
      best = pickBetterResult(best, attempt);
      if (isStrongLocalExtract(attempt)) return attempt;
    } catch {
      // Variant fetch/SSRF failures are non-fatal; keep best so far.
    }
  }
  return best;
}

async function extractOnce(url: string, options: ExtractorOptions): Promise<ExtractorResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const safeUrl = await assertSafeSourceFetchUrl(url, { resolveDns: fetchFn === fetch });
  const response = await fetchWithTimeout(
    fetchFn,
    safeUrl.href,
    { headers: LOCAL_FETCH_HEADERS },
    options.timeoutMs ?? 15000,
    options.abortSignal,
  );
  if (!response.ok) throw new Error(`readability fetch failed: ${response.status}`);
  const contentType = response.headers.get("content-type");
  if (/application\/pdf/i.test(contentType ?? "")) {
    return {
      url: safeUrl.href,
      text: null,
      html: null,
      extractionMethod: "failed",
      extractionStatus: "failed",
      contentType,
      error: "PDF response cannot be handled by webpage extractor",
    };
  }
  const html = await readBoundedResponseText(response, MAX_RESPONSE_BYTES);
  const text = extractBestMainContent(html);
  return {
    url: safeUrl.href,
    text: text ? text.slice(0, MAX_TEXT_CHARS) : null,
    html,
    extractionMethod: "readability_fetch",
    extractionStatus: text ? "success" : "partial",
    contentType,
  };
}

/**
 * Multi-strategy main-content extract: Readability, semantic/gov selectors, stripHtml last.
 * Picks the best candidate by length/density; rejects evidence shells.
 */
export function extractBestMainContent(html: string): string | null {
  if (!html?.trim()) return null;
  const candidates: Array<{ text: string; strategy: string }> = [];

  const readability = extractReadableArticleText(html);
  if (readability) candidates.push({ text: readability, strategy: "readability" });

  const selectorText = extractFromMainContentSelectors(html);
  if (selectorText) candidates.push({ text: selectorText, strategy: "dom_selectors" });

  const stripped = stripHtmlToText(html);
  if (stripped) candidates.push({ text: stripped, strategy: "strip_html" });

  return pickBestCandidate(candidates, html.length);
}

export function extractReadableArticleText(html: string): string | null {
  try {
    const { document } = parseHTML(html);
    const article = new Readability(document as unknown as Document).parse();
    const text = article?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!text || text.length < MIN_STRATEGY_CHARS) return null;
    const density = text.length / Math.max(1, html.length);
    if (density < 0.02 && html.length > 20_000) return null;
    if (isEvidenceShell(text)) return null;
    return text;
  } catch {
    return null;
  }
}

export function extractFromMainContentSelectors(html: string): string | null {
  try {
    const { document } = parseHTML(html);
    const found: string[] = [];
    for (const selector of MAIN_CONTENT_SELECTORS) {
      const nodes = document.querySelectorAll(selector);
      for (const node of Array.from(nodes)) {
        const clone = node.cloneNode(true) as {
          querySelectorAll?: (s: string) => ArrayLike<unknown>;
          textContent?: string | null;
        };
        if (typeof clone.querySelectorAll === "function") {
          for (const junk of Array.from(clone.querySelectorAll("script,style,nav,footer,aside,noscript"))) {
            (junk as { remove?: () => void }).remove?.();
          }
        }
        const text = (clone.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text.length >= MIN_STRATEGY_CHARS && !isEvidenceShell(text)) {
          found.push(text);
        }
      }
    }
    if (!found.length) return null;
    return found.sort((a, b) => scoreText(b, html.length) - scoreText(a, html.length))[0] ?? null;
  } catch {
    return null;
  }
}

export function stripHtmlToText(html: string): string | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || isEvidenceShell(text)) return null;
  return text;
}

function pickBestCandidate(
  candidates: Array<{ text: string; strategy: string }>,
  htmlLength: number,
): string | null {
  const valid = candidates.filter((c) => {
    const t = c.text.replace(/\s+/g, " ").trim();
    return t.length >= MIN_STRATEGY_CHARS && !isEvidenceShell(t);
  });
  if (!valid.length) return null;
  valid.sort((a, b) => scoreText(b.text, htmlLength) - scoreText(a.text, htmlLength));
  return valid[0]?.text.replace(/\s+/g, " ").trim() ?? null;
}

function scoreText(text: string, htmlLength: number): number {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized || isEvidenceShell(normalized)) return -1;
  const density = normalized.length / Math.max(1, htmlLength);
  const densityFactor = density < 0.01 ? 0.5 : density > 0.85 ? 0.85 : 1;
  return normalized.length * densityFactor;
}

export function isStrongLocalExtract(result: ExtractorResult): boolean {
  const text = (result.text ?? "").replace(/\s+/g, " ").trim();
  if (result.extractionStatus === "failed") return false;
  if (text.length < WEAK_EXTRACT_CHARS) return false;
  if (isEvidenceShell(text)) return false;
  return true;
}

function pickBetterResult(a: ExtractorResult, b: ExtractorResult): ExtractorResult {
  const aLen = (a.text ?? "").trim().length;
  const bLen = (b.text ?? "").trim().length;
  const aShell = a.text ? isEvidenceShell(a.text) : true;
  const bShell = b.text ? isEvidenceShell(b.text) : true;
  if (!bShell && aShell) return b;
  if (!aShell && bShell) return a;
  return bLen > aLen ? b : a;
}

/** AMP subdomain + simple print query variants (capped by caller). Each must still pass SSRF. */
export function collectSafeUrlVariants(url: string): string[] {
  const out: string[] = [];
  const amp = ampUrlVariant(url);
  if (amp && amp !== url) out.push(amp);
  const print = printUrlVariant(url);
  if (print && print !== url && !out.includes(print)) out.push(print);
  return out;
}

export function printUrlVariant(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("print")) return null;
    if (/\/print\/?$/i.test(parsed.pathname) || parsed.pathname.includes("/print/")) return null;
    parsed.searchParams.set("print", "1");
    return parsed.toString();
  } catch {
    return null;
  }
}

async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    throw new Error(`Response content-length ${contentLength} exceeds maximum ${maxBytes}`);
  }
  const reader = response.body?.getReader();
  if (!reader) return response.text();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = maxBytes - total;
    const chunk = value.slice(0, remaining);
    parts.push(decoder.decode(chunk, { stream: true }));
    total += chunk.byteLength;
    if (chunk.byteLength < value.byteLength) {
      reader.cancel();
      break;
    }
  }
  return parts.join("") + decoder.decode();
}

export async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  abortSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (abortSignal?.aborted) controller.abort();
  abortSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    abortSignal?.removeEventListener("abort", abortFromParent);
    clearTimeout(timeout);
  }
}
