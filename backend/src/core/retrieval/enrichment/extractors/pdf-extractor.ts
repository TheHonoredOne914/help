import { assertSafeSourceFetchUrl } from "../../../security/source-url-policy.js";
import { fetchWithTimeout } from "./webpage-extractor.js";
import type { ExtractorOptions, ExtractorResult } from "../types.js";

export async function extract(url: string, options: ExtractorOptions = {}): Promise<ExtractorResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const safeUrl = await assertSafeSourceFetchUrl(url, { resolveDns: fetchFn === fetch });
  const response = await fetchWithTimeout(fetchFn, safeUrl.href, {}, options.timeoutMs ?? 15000, options.abortSignal);
  const contentType = response.headers.get("content-type");
  if (!response.ok) {
    return failed(safeUrl.href, `pdf fetch failed: ${response.status}`, contentType);
  }
  if (!isPdfUrl(safeUrl.href) && !/application\/pdf/i.test(contentType ?? "")) {
    return failed(safeUrl.href, "not a PDF response", contentType);
  }

  try {
    const moduleName = "pdfjs-dist/legacy/build/pdf.mjs";
    const pdfjs = await import(moduleName) as any;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const document = await pdfjs.getDocument({ data: bytes }).promise;
    const pages: string[] = [];
    const maxPages = Math.min(document.numPages ?? 0, 8);
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push((content.items ?? []).map((item: any) => item.str).filter(Boolean).join(" "));
    }
    const text = pages.join("\n\n").replace(/\s+/g, " ").trim();
    return {
      url: safeUrl.href,
      text: text || null,
      extractionMethod: text ? "readability_fetch" : "failed",
      extractionStatus: text ? "success" : "failed",
      contentType,
      error: text ? undefined : "PDF had no extractable text",
    };
  } catch (error) {
    return failed(safeUrl.href, `PDF extraction unavailable: ${error instanceof Error ? error.message : String(error)}`, contentType);
  }
}

export function isPdfUrl(url: string): boolean {
  return /\.pdf(?:[?#].*)?$/i.test(url);
}

function failed(url: string, error: string, contentType?: string | null): ExtractorResult {
  return {
    url,
    text: null,
    extractionMethod: "failed",
    extractionStatus: "failed",
    error,
    contentType,
  };
}
