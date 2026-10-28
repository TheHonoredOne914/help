import "server-only";
import { parseSiteOrigin } from "./origin";

export type SiteMode = "public" | "demo" | "live";
export type PaymentsMode = "disabled" | "mock";

export type ServerEnv = {
  siteMode: SiteMode;
  paymentsMode: PaymentsMode;
  enableYookassa: false;
  enableCrypto: false;
  demoFixtures: boolean;
  apiBaseUrl: string | null;
  /** Public origin (exact scheme://host[:port]) for payment return URLs and the CSRF Origin check; empty in local demo. */
  siteOrigin: string;
};

function parseApiBaseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) return null;
    return url.origin + url.pathname.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function getServerEnv(): ServerEnv {
  // public (unset or any value other than demo/live): confirmed catalog, web checkout off.
  // live stays the unverified backend stub. demo keeps the in-memory TEST site.
  const siteMode: SiteMode =
    process.env.SITE_MODE === "live" ? "live" : process.env.SITE_MODE === "demo" ? "demo" : "public";
  // This build only knows "disabled" and an in-memory "mock"; sandbox/production values are refused,
  // and mock checkout never runs outside demo.
  const paymentsMode: PaymentsMode =
    process.env.PAYMENTS_MODE === "mock" && siteMode === "demo" ? "mock" : "disabled";

  return {
    siteMode,
    paymentsMode,
    enableYookassa: false,
    enableCrypto: false,
    demoFixtures: siteMode === "demo" && process.env.DEMO_FIXTURES === "test",
    apiBaseUrl: parseApiBaseUrl(process.env.ORASAKA_API_URL),
    siteOrigin: parseSiteOrigin(process.env.SITE_ORIGIN) ?? "",
  };
}
