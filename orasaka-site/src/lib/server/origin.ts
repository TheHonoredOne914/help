/*
 * Origin rules for cookie-authenticated mutations (CSRF guard). Pure functions, no env access.
 *
 * 1. SITE_ORIGIN set (production/staging): the request's Origin must equal it exactly —
 *    scheme, host and port. SITE_ORIGIN must be https://…, or http:// only for loopback hosts.
 * 2. SITE_ORIGIN unset: only local development is accepted — Origin must be
 *    http://localhost|127.0.0.1|[::1][:port] and equal to http://<Host header>.
 *    Any other deployment without SITE_ORIGIN therefore rejects every mutation (fails closed).
 * Forwarded headers (X-Forwarded-Host/Proto, Forwarded) are never consulted: behind a TLS proxy
 * set SITE_ORIGIN to the public https origin instead.
 */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Normalises a configured origin; returns null for anything that is not a bare, allowed origin. */
export function parseSiteOrigin(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) return null;
  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && LOOPBACK.has(url.hostname)) return url.origin;
  return null;
}

/** Exact origin string from a request header, or null when absent, "null" or malformed. */
function requestOrigin(header: string | null): string | null {
  if (!header || header === "null") return null;
  try {
    const url = new URL(header);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // An Origin header is a bare origin; anything else is malformed.
    if (url.origin !== header) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isAllowedOrigin(originHeader: string | null, hostHeader: string | null, siteOrigin: string | null): boolean {
  const origin = requestOrigin(originHeader);
  if (!origin) return false;
  if (siteOrigin) return origin === siteOrigin;
  if (!hostHeader) return false;
  let local: URL;
  try {
    local = new URL(`http://${hostHeader}`);
  } catch {
    return false;
  }
  if (!LOOPBACK.has(local.hostname) || local.host !== hostHeader.toLowerCase()) return false;
  return origin === local.origin;
}
