import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { assertSafeSourceFetchUrl } from "../../../security/source-url-policy.js";
import type { ExtractorOptions, ExtractorResult } from "../types.js";

export async function extract(url: string, options: ExtractorOptions = {}): Promise<ExtractorResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const safeUrl = await assertSafeSourceFetchUrl(url, { resolveDns: fetchFn === fetch });
  const response = await fetchWithTimeout(fetchFn, safeUrl.href, {}, options.timeoutMs ?? 15000, options.abortSignal);
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
  const articleText = extractReadableArticleText(html);
  const text = articleText ?? stripHtmlToText(html);
  return {
    url: safeUrl.href,
    text: text ? text.slice(0, 20_000) : null,
    html,
    extractionMethod: "readability_fetch",
    extractionStatus: text ? "success" : "partial",
    contentType,
  };
}

export function extractReadableArticleText(html: string): string | null {
  try {
    const { document } = parseHTML(html);
    const article = new Readability(document as unknown as Document).parse();
    const text = article?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!text || text.length < 120) return null;
    const density = text.length / Math.max(1, html.length);
    if (density < 0.02 && html.length > 20_000) return null;
    return text;
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
  return text || null;
}

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

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

export async function fetchWithTimeout(fetchFn: typeof fetch, url: string, init: RequestInit, timeoutMs: number, abortSignal?: AbortSignal): Promise<Response> {
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
