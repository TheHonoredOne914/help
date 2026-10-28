import "server-only";
import type { OrasakaApiClient } from "./client";
import type { ApiResult } from "./types";

/**
 * Public informational site. Every catalog, session mutation and order call is closed.
 * This is not the live stub: pages must not surface `backend_not_configured`.
 */
export function createPublicClient(): OrasakaApiClient {
  const closed = async (): Promise<ApiResult<never>> => ({ ok: false, error: "not_found" });
  return {
    source: "public",
    auth: {
      getSession: async () => ({ ok: true, data: { authenticated: false, user: null, demoLoginAvailable: false } }),
      loginWithTelegram: closed,
      logout: async () => ({ ok: true, data: null }),
    },
    plans: { list: closed },
    orders: { create: closed, get: closed, list: closed, cancel: closed },
    subscription: { get: closed, renew: closed },
    connection: { getLink: closed },
    devices: { list: closed, remove: closed },
  };
}
