/**
 * Secure flag for the session cookie. Pure: no request object, no env reads.
 *
 * An https SITE_ORIGIN always forces Secure. A client X-Forwarded-Proto cannot
 * turn it off. The header is read only when trustProxy is set, and only because
 * the reverse proxy overwrites it. A non-Secure cookie exists for loopback
 * plain HTTP: demo, and public when no https origin is configured, so a local
 * login session is stored. Live mode stays Secure. https SITE_ORIGIN stays Secure.
 */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);

export type SessionCookieSecureInput = {
  siteOrigin: string;
  siteMode: "public" | "demo" | "live";
  trustProxy: boolean;
  hostname: string;
  /** request.nextUrl.protocol, e.g. "http:" */
  protocol: string;
  forwardedProto: string | null;
};

export function sessionCookieSecure(input: SessionCookieSecureInput): boolean {
  if (input.siteOrigin.startsWith("https:")) return true;
  if (!LOOPBACK.has(input.hostname)) return true;
  if (input.siteMode === "live") return true;
  // Local public HTTP has no TLS, so the session cookie cannot be Secure or the browser drops it.
  if (input.siteMode === "public") {
    const localOrigin = input.siteOrigin === "" || input.siteOrigin.startsWith("http://");
    if (localOrigin && input.protocol === "http:" && !input.trustProxy) return false;
    return true;
  }
  if (!input.trustProxy) return input.protocol === "https:";
  const forwarded = input.forwardedProto?.split(",")[0]?.trim();
  return forwarded === "https";
}
