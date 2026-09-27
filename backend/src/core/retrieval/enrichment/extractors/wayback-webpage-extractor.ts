import { assertSafeSourceFetchUrl } from "../../../security/source-url-policy.js";
import { isEvidenceShell } from "../source-quality.js";
import type { ExtractorOptions, ExtractorResult } from "../types.js";
import { extractBestMainContent, fetchWithTimeout, LOCAL_FETCH_HEADERS } from "./webpage-extractor.js";

const MAX_TEXT_CHARS = 20_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const WAYBACK_AVAILABILITY_API = "https://archive.org/wayback/available";

/**
 * Public Wayback Machine fallback (SSRF-safe).
 * 1. Query availability API for the original URL
 * 2. Fetch the closest public snapshot once
 * 3. Run HTML through extractBestMainContent / shell rejection

 */
export async function extractWaybackWebpage(
  url: string,
  options: ExtractorOptions = {},
): Promise<ExtractorResult> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const fetchFn = options.fetchFn ?? fetch;

  let safeOriginal: URL;
  try {
    safeOriginal = await assertSafeSourceFetchUrl(url, {
      resolveDns: fetchFn === fetch,
    });
  } catch (error) {
    return failed(url, error instanceof Error ? error.message : String(error));
  }

  try {
    const snapshotUrl = await resolveWaybackSnapshotUrl(safeOriginal.href, fetchFn, timeoutMs, options.abortSignal);
    if (!snapshotUrl) {
      return failed(safeOriginal.href, "no Wayback snapshot available");
    }

    const safeSnapshot = await assertSafeSourceFetchUrl(snapshotUrl, {
      resolveDns: fetchFn === fetch,
    });

    const response = await fetchWithTimeout(
      fetchFn,
      safeSnapshot.href,
      { headers: LOCAL_FETCH_HEADERS },
      timeoutMs,
      options.abortSignal,
    );
    if (!response.ok) {
      return failed(safeOriginal.href, "wayback snapshot fetch failed: " + response.status);
    }

    const html = await readBoundedText(response, MAX_RESPONSE_BYTES);
    const text = extractBestMainContent(html);
    if (!text || isEvidenceShell(text)) {
      return {
        url: safeOriginal.href,
        text: null,
        html,
        extractionMethod: "wayback_fetch",
        extractionStatus: "partial",
        error: text
          ? "wayback snapshot still looks like an evidence shell"
          : "wayback snapshot produced no main content",
      };
    }

    return {
      url: safeOriginal.href,
      text: text.slice(0, MAX_TEXT_CHARS),
      html,
      extractionMethod: "wayback_fetch",
      extractionStatus: "success",
    };
  } catch (error) {
    return failed(safeOriginal.href, error instanceof Error ? error.message : String(error));
  }
}

export async function resolveWaybackSnapshotUrl(
  originalUrl: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
  abortSignal?: AbortSignal,
): Promise<string | null> {
  const availabilityUrl = WAYBACK_AVAILABILITY_API + "?url=" + encodeURIComponent(originalUrl);
  const safeApi = await assertSafeSourceFetchUrl(availabilityUrl, {
    resolveDns: fetchFn === fetch,
  });
  const response = await fetchWithTimeout(
    fetchFn,
    safeApi.href,
    { headers: { Accept: "application/json" } },
    timeoutMs,
    abortSignal,
  );
  if (!response.ok) return null;
  const payload = await response.json() as {
    archived_snapshots?: { closest?: { available?: boolean; url?: string } };
  };
  const closest = payload.archived_snapshots?.closest;
  if (!closest?.available || !closest.url) return null;
  try {
    const parsed = new URL(closest.url);
    if (parsed.protocol === "http:") parsed.protocol = "https:";
    return parsed.toString();
  } catch {
    return null;
  }
}

function failed(url: string, error: string): ExtractorResult {
  return {
    url,
    text: null,
    html: null,
    extractionMethod: "failed",
    extractionStatus: "failed",
    error: "wayback extract failed: " + error,
  };
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    throw new Error("Response content-length " + contentLength + " exceeds maximum " + maxBytes);
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
