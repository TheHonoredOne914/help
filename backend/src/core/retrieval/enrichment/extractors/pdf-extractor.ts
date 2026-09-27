import { assertSafeSourceFetchUrl } from "../../../security/source-url-policy.js";
import { fetchWithTimeout, LOCAL_FETCH_HEADERS } from "./webpage-extractor.js";
import type { ExtractorOptions, ExtractorResult } from "../types.js";

const MAX_PDF_PAGES = 16;
const MAX_PDF_TEXT_CHARS = 40_000;

export async function extract(url: string, options: ExtractorOptions = {}): Promise<ExtractorResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const safeUrl = await assertSafeSourceFetchUrl(url, { resolveDns: fetchFn === fetch });
  const response = await fetchWithTimeout(
    fetchFn,
    safeUrl.href,
    { headers: LOCAL_FETCH_HEADERS },
    options.timeoutMs ?? 15000,
    options.abortSignal,
  );
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
    const maxPages = Math.min(document.numPages ?? 0, MAX_PDF_PAGES);
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push((content.items ?? []).map((item: any) => item.str).filter(Boolean).join(" "));
    }
    const text = pages.join("\n\n").replace(/\s+/g, " ").trim().slice(0, MAX_PDF_TEXT_CHARS);
    // extractionMethod stays readability_fetch for EnrichedSource type compatibility (no pdf_* variant).
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
  if (/\.pdf(?:[?#].*)?$/i.test(url)) return true;
  try {
    const parsed = new URL(url);
    if (/\/(?:api\/)?download(?:\/|$)/i.test(parsed.pathname)) return true;
    // SCI judgment endpoints often omit .pdf (e.g. /sci-get-pdf/?diary_no=…&type=j).
    // Without this, extractLocally treats them as HTML → shell/snippet (live snippet 20/55).
    if (/sci-get-pdf|get[-_]?pdf|pdfviewer|viewpdf/i.test(parsed.pathname)) return true;
    if (/(?:^|[?&])(?:type|format|file)=pdf(?:&|$)/i.test(parsed.search)) return true;
  } catch {
    /* ignore invalid URL */
  }
  return false;
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
