import "server-only";
import type { OrasakaApiClient } from "./client";
import type { ApiErrorCode, ApiResult } from "./types";

type LiveOptions = { baseUrl: string | null; timeoutMs: number };

const RETRYABLE: ApiErrorCode[] = ["timeout", "unavailable"];

export function mapHttpStatus(status: number): ApiErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  return "bad_request";
}

/**
 * LIVE client for the existing FastAPI service. Transport is real (timeout via
 * AbortSignal, bounded retries for reads only, no caching). Response mapping and
 * session forwarding are NOT implemented until the OpenAPI schema and auth flow
 * are verified, so every method returns `contract_unverified` (see API_CONTRACT.md).
 */
export function createLiveClient({ baseUrl, timeoutMs }: LiveOptions): OrasakaApiClient {
  async function get(path: string, attempts = 2): Promise<ApiResult<unknown>> {
    if (!baseUrl) return { ok: false, error: "backend_not_configured" };
    let last: ApiErrorCode = "unavailable";
    for (let i = 0; i <= attempts; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 300 * 2 ** (i - 1)));
      try {
        const res = await fetch(`${baseUrl}${path}`, {
          method: "GET",
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
          headers: { accept: "application/json" },
        });
        if (res.ok) return { ok: true, data: await res.json() };
        last = mapHttpStatus(res.status);
      } catch (err) {
        last = err instanceof DOMException && err.name === "TimeoutError" ? "timeout" : "unavailable";
      }
      if (!RETRYABLE.includes(last)) break;
    }
    return { ok: false, error: last };
  }

  const unverified = async (): Promise<ApiResult<never>> =>
    baseUrl ? { ok: false, error: "contract_unverified" } : { ok: false, error: "backend_not_configured" };

  return {
    source: "live",
    auth: {
      getSession: async () => ({ ok: true, data: { authenticated: false, user: null, demoLoginAvailable: false } }),
      loginWithTelegram: unverified,
      logout: async () => ({ ok: true, data: null }),
    },
    plans: {
      list: async () => {
        const res = await get("/plans");
        return res.ok ? { ok: false, error: "contract_unverified" } : res;
      },
    },
    orders: { create: unverified, get: unverified, list: unverified, cancel: unverified },
    subscription: { get: unverified, renew: unverified },
    connection: { getLink: unverified },
    devices: { list: unverified, remove: unverified },
  };
}
