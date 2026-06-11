import { logger } from "./logger.js";

// Keep a rotating index for each set of keys to avoid repeatedly burning the first key.
// The key is the original comma-separated string, the value is the current index.
const keyIndexCache = new Map<string, number>();

// Track known-bad keys per key-string with TTL (5 minutes).
// Prevents wasting requests on keys that recently returned 401/403.
const BAD_KEY_TTL_MS = 5 * 60 * 1000;
const badKeyCache = new Map<string, Map<string, number>>();

function isKeyBad(cacheKey: string, key: string): boolean {
  const bad = badKeyCache.get(cacheKey);
  if (!bad) return false;
  const ts = bad.get(key);
  if (!ts) return false;
  if (Date.now() - ts > BAD_KEY_TTL_MS) {
    bad.delete(key);
    if (bad.size === 0) badKeyCache.delete(cacheKey);
    return false;
  }
  return true;
}

function markKeyBad(cacheKey: string, key: string): void {
  if (!badKeyCache.has(cacheKey)) badKeyCache.set(cacheKey, new Map());
  badKeyCache.get(cacheKey)!.set(key, Date.now());
}

function markKeyGood(cacheKey: string, key: string): void {
  badKeyCache.get(cacheKey)?.delete(key);
}

type HeaderCarrier = { type: "header"; name: string; prefix: string; keyString: string; keys: string[] };
type QueryCarrier = { type: "query"; name: string; keyString: string; keys: string[] };
type KeyCarrier = HeaderCarrier | QueryCarrier;

const RETRYABLE_STATUSES = new Set([401, 402, 403, 408, 429, 432, 500, 502, 503, 504, 529]);
const BAD_KEY_STATUSES = new Set([401, 402, 403, 429, 432]);

function parseKeys(keyString: string): string[] {
  return keyString.split(",").map((key) => key.trim()).filter(Boolean);
}

function carrierKey(keys: string[]): string {
  return keys.join(",");
}

function sameKeyList(a: string[], b: string[]): boolean {
  return carrierKey(a) === carrierKey(b);
}

function collectHeaderCarrier(headers: Headers, name: string): HeaderCarrier | null {
  const value = headers.get(name);
  if (!value?.includes(",")) return null;
  const lower = value.toLowerCase();
  const prefix = lower.startsWith("bearer ") ? value.slice(0, 7) : "";
  const keyString = prefix ? value.slice(7) : value;
  const keys = parseKeys(keyString);
  return keys.length > 1 ? { type: "header", name, prefix, keyString: carrierKey(keys), keys } : null;
}

function collectQueryCarrier(url: URL | null, name: string): QueryCarrier | null {
  const value = url?.searchParams.get(name);
  if (!value?.includes(",")) return null;
  const keys = parseKeys(value);
  return keys.length > 1 ? { type: "query", name, keyString: carrierKey(keys), keys } : null;
}

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    return new URL(typeof input === "string" ? input : input instanceof Request ? input.url : input.toString());
  } catch {
    return null;
  }
}

async function fetchWith(input: RequestInfo | URL, init: RequestInit | undefined, headers: Headers, url: URL | null): Promise<Response> {
  if (input instanceof Request) {
    const clonedReq = input.clone();
    const nextInit: RequestInit = {
      method: init?.method ?? clonedReq.method,
      headers,
      body: clonedReq.body ? await clonedReq.clone().arrayBuffer() : null,
      redirect: clonedReq.redirect,
      signal: init?.signal ?? clonedReq.signal,
    };
    return fetch(url?.toString() ?? clonedReq.url, nextInit);
  }

  return fetch(url?.toString() ?? input, { ...init, headers });
}

/**
 * A drop-in replacement for the global fetch function that intercepts
 * requests with multiple API keys (comma-separated in headers) and 
 * automatically retries on rate limits (429) or quota errors (401/402/403).
 *
 * Proactive bad-key tracking:
 * - Keys that returned 401/403 are marked bad for 5 minutes
 * - On the next request, known-bad keys are skipped entirely
 * - On success, a key is cleared from the bad set
 */
export async function multiKeyFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  let requestHeaders = new Headers();

  if (input instanceof Request) {
    input.headers.forEach((value, key) => requestHeaders.set(key, value));
  }
  if (init?.headers) {
    const initHeaders = new Headers(init.headers);
    initHeaders.forEach((value, key) => requestHeaders.set(key, value));
  }

  const urlObj = requestUrl(input);
  const carriers = [
    collectHeaderCarrier(requestHeaders, "Authorization"),
    collectHeaderCarrier(requestHeaders, "x-api-key"),
    collectHeaderCarrier(requestHeaders, "X-API-KEY"),
    collectHeaderCarrier(requestHeaders, "X-Subscription-Token"),
    collectHeaderCarrier(requestHeaders, "X-GitHub-Models-Api-Key"),
    collectHeaderCarrier(requestHeaders, "X-GitHub-Token"),
    collectQueryCarrier(urlObj, "api_key"),
    collectQueryCarrier(urlObj, "apikey"),
    collectQueryCarrier(urlObj, "key"),
  ].filter((carrier): carrier is KeyCarrier => Boolean(carrier));

  const primaryCarrier = carriers[0];
  if (!primaryCarrier) return fetch(input, init);

  const keys = primaryCarrier.keys;
  const cacheKey = primaryCarrier.keyString;
  let currentIndex = keyIndexCache.get(cacheKey) ?? 0;
  const activeCarriers = carriers.filter((carrier) => sameKeyList(carrier.keys, keys));

  const tryOrder: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    const candidate = keys[(currentIndex + i) % keys.length];
    if (!isKeyBad(cacheKey, candidate)) {
      tryOrder.push(candidate);
    }
  }
  // If all keys are bad, try them all anyway (TTL might expire during retries)
  if (tryOrder.length === 0) {
    for (let i = 0; i < keys.length; i++) {
      tryOrder.push(keys[(currentIndex + i) % keys.length]);
    }
  }

  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < tryOrder.length; attempt++) {
    const activeKey = tryOrder[attempt];
    const newHeaders = new Headers(requestHeaders);
    const newUrl = urlObj ? new URL(urlObj.toString()) : null;

    for (const carrier of activeCarriers) {
      if (carrier.type === "header") newHeaders.set(carrier.name, carrier.prefix + activeKey);
      else newUrl?.searchParams.set(carrier.name, activeKey);
    }

    try {
      lastResponse = await fetchWith(input, init, newHeaders, newUrl);
    } catch (networkErr) {
      // If the abort signal was already triggered (timeout / pipeline cancel), don't retry.
      if ((init as RequestInit)?.signal?.aborted) {
        if (attempt === tryOrder.length - 1) throw networkErr;
        break;
      }
      const maskedKey = `...${activeKey.slice(-4)}`;
      logger.warn(`[multi-key-fetch] Key ${maskedKey} network error: ${(networkErr as Error)?.message ?? networkErr}. Rolling over to next key. (${attempt + 1}/${tryOrder.length})`);
      markKeyBad(cacheKey, activeKey);
      if (attempt === tryOrder.length - 1) throw networkErr;
      continue;
    }

    if (RETRYABLE_STATUSES.has(lastResponse.status)) {
      if ((init as RequestInit)?.signal?.aborted) break;
      const maskedKey = `...${activeKey.slice(-4)}`;
      logger.warn(`[multi-key-fetch] Key ${maskedKey} got ${lastResponse.status}. Rolling over to next key. (${attempt + 1}/${tryOrder.length})`);
      if (BAD_KEY_STATUSES.has(lastResponse.status)) {
        markKeyBad(cacheKey, activeKey);
      }
      continue;
    }

    // Success or non-retryable error — update cache and mark key as good
    const originalIndex = keys.indexOf(activeKey);
    keyIndexCache.set(cacheKey, originalIndex >= 0 ? originalIndex : (currentIndex + attempt) % keys.length);
    if (lastResponse.ok) {
      markKeyGood(cacheKey, activeKey);
    }
    return lastResponse;
  }

  // All keys failed — bump index so we don't hammer the exact same sequence
  keyIndexCache.set(cacheKey, (currentIndex + 1) % keys.length);
  return lastResponse!;
}
