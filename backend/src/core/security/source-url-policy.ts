import { lookup as defaultLookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UnsafeSourceUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeSourceUrlError";
  }
}

export interface SourceUrlPolicyOptions {
  resolveDns?: boolean;
  dnsLookup?: typeof defaultLookup;
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
]);

export function validateSourceFetchUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new UnsafeSourceUrlError("Unsafe source URL: invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeSourceUrlError("Unsafe source URL: only http and https are allowed");
  }
  if (parsed.username || parsed.password) {
    throw new UnsafeSourceUrlError("Unsafe source URL: credentials are not allowed");
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname) throw new UnsafeSourceUrlError("Unsafe source URL: hostname is required");
  if (isBlockedHostname(hostname) || isUnsafeIpAddress(hostname)) {
    throw new UnsafeSourceUrlError(`Unsafe source URL: blocked host ${hostname}`);
  }

  return parsed;
}

export async function assertSafeSourceFetchUrl(value: string, options: SourceUrlPolicyOptions = {}): Promise<URL> {
  const parsed = validateSourceFetchUrl(value);
  const hostname = normalizeHostname(parsed.hostname);
  if (options.resolveDns === false || isIP(stripIpv6Brackets(hostname)) !== 0) {
    return parsed;
  }

  const dnsLookup = options.dnsLookup ?? defaultLookup;
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  for (const record of records) {
    if (isUnsafeIpAddress(record.address)) {
      throw new UnsafeSourceUrlError(`Unsafe source URL: ${hostname} resolves to blocked address`);
    }
  }
  return parsed;
}

export function buildJinaReaderUrl(sourceUrl: URL): string {
  return `https://r.jina.ai/${sourceUrl.href}`;
}

function isBlockedHostname(hostname: string): boolean {
  return BLOCKED_HOSTS.has(hostname)
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
    || hostname.endsWith(".lan")
    || hostname.endsWith(".home")
    || hostname.endsWith(".home.arpa");
}

function normalizeHostname(hostname: string): string {
  return stripIpv6Brackets(hostname).replace(/\.$/, "").toLowerCase();
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.replace(/^\[/, "").replace(/\]$/, "");
}

function isUnsafeIpAddress(hostname: string): boolean {
  const normalized = stripIpv6Brackets(hostname).toLowerCase();
  const mapped = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isUnsafeIpv4(mapped[1]);

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return isUnsafeIpv4(normalized);
  if (ipVersion === 6) return isUnsafeIpv6(normalized);
  return false;
}

function isUnsafeIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isUnsafeIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return normalized === "::"
    || normalized === "::1"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || normalized.startsWith("fe8")
    || normalized.startsWith("fe9")
    || normalized.startsWith("fea")
    || normalized.startsWith("feb")
    || normalized.startsWith("ff");
}
