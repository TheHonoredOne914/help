export type ExtractionCooldownState = {

  firecrawlTimeoutCount: number;
  jinaTimeoutCount: number;
  jina422Urls: Set<string>;
  firecrawlCooledDown: boolean;
  jinaCooledDown: boolean;
}

export const EXTRACTION_TIMEOUT_THRESHOLD = 3;

export function createExtractionCooldown(): ExtractionCooldownState {
  return {
    firecrawlTimeoutCount: 0,
    jinaTimeoutCount: 0,
    jina422Urls: new Set(),
    firecrawlCooledDown: false,
    jinaCooledDown: false,
  };
}

export function recordExtractionFailure(
  state: ExtractionCooldownState,
  provider: "firecrawl" | "jina",
  statusCode: number | undefined,
  url?: string,
): void {
  if (statusCode === 422 && url) {
    state.jina422Urls.add(url);
    return;
  }

  if (statusCode === 401 || statusCode === 402 || statusCode === 403 || statusCode === 429) {
    if (provider === "firecrawl") state.firecrawlCooledDown = true;
    if (provider === "jina") state.jinaCooledDown = true;
    return;
  }

  const isTimeout = statusCode === 504 || statusCode === 408 || (typeof statusCode === "number" && statusCode >= 500);
  if (isTimeout) {
    if (provider === "firecrawl") {
      state.firecrawlTimeoutCount += 1;
      if (state.firecrawlTimeoutCount >= EXTRACTION_TIMEOUT_THRESHOLD) {
        state.firecrawlCooledDown = true;
      }
    }
    if (provider === "jina") {
      state.jinaTimeoutCount += 1;
      if (state.jinaTimeoutCount >= EXTRACTION_TIMEOUT_THRESHOLD) {
        state.jinaCooledDown = true;
      }
    }
  }
}

export function shouldSkipExtractionProvider(
  state: ExtractionCooldownState,
  provider: "firecrawl" | "jina",
  url?: string,
): boolean {
  if (provider === "firecrawl" && state.firecrawlCooledDown) return true;
  if (provider === "jina" && state.jinaCooledDown) return true;
  if (provider === "jina" && url && state.jina422Urls.has(url)) return true;
  return false;
}
