import "server-only";
import type { OrasakaApiClient } from "./client";
import type { ApiResult } from "./types";

type LiveOptions = { baseUrl: string | null };

/**
 * LIVE client for the existing FastAPI service — a blocking stub until the OpenAPI schema and
 * the site auth flow are agreed (see API_CONTRACT.md, «Открытые вопросы»). It never opens a
 * network connection: without ORASAKA_API_URL every method returns `backend_not_configured`,
 * with it — `contract_unverified`. Enabling the integration means replacing this file with a
 * client that maps verified FastAPI responses; there is no runtime switch.
 */
export function createLiveClient({ baseUrl }: LiveOptions): OrasakaApiClient {
  const unverified = async (): Promise<ApiResult<never>> =>
    baseUrl ? { ok: false, error: "contract_unverified" } : { ok: false, error: "backend_not_configured" };

  return {
    source: "live",
    auth: {
      getSession: async () => ({ ok: true, data: { authenticated: false, user: null, demoLoginAvailable: false } }),
      loginWithTelegram: unverified,
      logout: async () => ({ ok: true, data: null }),
    },
    plans: { list: unverified },
    orders: { create: unverified, get: unverified, list: unverified, cancel: unverified },
    subscription: { get: unverified, renew: unverified },
    connection: { getLink: unverified },
    devices: { list: unverified, remove: unverified },
  };
}
