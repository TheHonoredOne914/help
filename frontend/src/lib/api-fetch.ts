import { getProviderHeaders } from "@/lib/provider-keys";
import { supabase } from "@/lib/supabase";

const MAX_RETRIES = 2;
const RETRY_DELAY_BASE_MS = 1000;

/**
 * Central fetch wrapper for all /api/* calls.
 *
 * - Injects BYOK headers from Settings → Keys
 * - Injects Supabase JWT for backend auth
 * - Retries non-streaming requests up to 2 times with exponential backoff
 * - Never retries streaming requests (they have their own reconnect logic)
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  retries = MAX_RETRIES
): Promise<Response> {
  // Get Supabase JWT for backend auth
  const { data: { session } } = await supabase.auth.getSession();
  const authHeader: Record<string, string> = session?.access_token
    ? { "Authorization": `Bearer ${session.access_token}` }
    : {};

  const existing =
    init.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : Array.isArray(init.headers)
        ? Object.fromEntries(init.headers)
        : { ...(init.headers as Record<string, string> | undefined) };

  const merged: Record<string, string> = {
    ...authHeader,          // ← inject JWT first
    ...getProviderHeaders(),
    ...existing,
  };

  // Streaming is explicitly requested via Accept header, or inferred from POST to /messages endpoint
  const isStreamingRequest = merged["Accept"] === "text/event-stream" ||
    (typeof input === "string" && input.includes("/messages") && (init.method ?? "GET") === "POST");

  // Never retry streaming requests — they have their own reconnect logic
  if (isStreamingRequest) {
    return fetch(input, { ...init, headers: merged });
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(input, { ...init, headers: merged });
      // Retry on 5xx server errors and 429 rate limits
      if ((response.status >= 500 || response.status === 429) && attempt < retries) {
        const urlStr = typeof input === "string" ? input : input.toString();
        // Don't auto-retry 429 on /messages endpoint — surface to UI for user action
        if (response.status === 429 && urlStr.includes("/messages")) {
          return response;
        }
        let delay = RETRY_DELAY_BASE_MS * Math.pow(2, attempt);
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          if (retryAfter) {
            const secs = Number(retryAfter);
            if (!Number.isNaN(secs)) delay = secs * 1000;
          }
        }
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return response;
    } catch (err) {
      if ((err as any)?.name === "AbortError") throw err;
      if (attempt === retries) throw err;
      const delay = RETRY_DELAY_BASE_MS * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error("apiFetch: all retries exhausted");
}
