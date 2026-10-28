import { isAbsolute, resolve, sep } from "node:path";
import { envGet } from "./env-get";

/** public is the only profile allowed on the VPS. isolated is local next start, never that host. */
export function siteProfile(): "public" | "isolated" {
  const raw = envGet("ORASAKA_PROFILE") ?? "public";
  if (raw === "public" || raw === "isolated") return raw;
  throw new Error("ORASAKA_PROFILE must be public or isolated");
}

export function assertBootConfig(): void {
  const profile = siteProfile();
  const trust = envGet("TRUST_PROXY");
  if (trust !== undefined && trust !== "1") throw new Error("TRUST_PROXY must be empty or 1");
  if (profile === "public" && (envGet("MAIL_MODE") === "dev" || envGet("VPN_MODE") === "double")) {
    throw new Error("public profile refuses MAIL_MODE=dev and VPN_MODE=double; ORASAKA_PROFILE=isolated must not be used on the public VPS");
  }
  if (profile === "public" && envGet("SMTP_INSECURE") === "1") throw new Error("public profile refuses SMTP_INSECURE");
  const issuer = envGet("TELEGRAM_OIDC_ISSUER");
  if (profile === "public" && issuer && issuer !== "https://oauth.telegram.org") {
    throw new Error("public profile refuses a non-official Telegram OIDC issuer");
  }
  if (profile === "public" && envGet("VPN_DURATION_RULE") === "test-30-day-blocks") {
    throw new Error("public profile refuses the test duration rule");
  }
  if (profile === "public" && envGet("CRYPTOPAY_LOCAL_STAND") === "1") {
    throw new Error("public profile refuses CRYPTOPAY_LOCAL_STAND");
  }
  if (profile === "public" && envGet("YOOKASSA_LOCAL_STAND") === "1") {
    throw new Error("public profile refuses YOOKASSA_LOCAL_STAND");
  }
  const db = envGet("ORASAKA_DB_PATH") ?? "";
  if (!isAbsolute(db)) throw new Error("ORASAKA_DB_PATH must be an absolute path outside the release directory");
  const root = resolve(/*turbopackIgnore: true*/ process.cwd());
  const target = resolve(/*turbopackIgnore: true*/ db);
  if (target === root || target.startsWith(`${root}${sep}`)) {
    throw new Error("ORASAKA_DB_PATH must be outside the release directory");
  }
}

export function databasePath(): string {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    const configured = envGet("ORASAKA_DB_PATH");
    if (configured && isAbsolute(configured) && !resolve(/*turbopackIgnore: true*/ configured).startsWith(`${resolve(/*turbopackIgnore: true*/ process.cwd())}${sep}`)) return configured;
    return "/tmp/orasaka-next-build.sqlite";
  }
  assertBootConfig();
  return envGet("ORASAKA_DB_PATH") ?? "";
}
