import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

const ISSUER = "https://oauth.telegram.org";

function b64urlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export type IdTokenResult = { ok: true; id: string } | { ok: false; error: "bad_proof" | "expired" };

/** Official OIDC id_token (RS256). Identity is the numeric `id` claim, never preferred_username. */
export function verifyTelegramIdToken(
  token: string,
  opts: { clientId: string; nonce: string; now: number; keys: JsonWebKey[]; issuer?: string },
): IdTokenResult {
  const parts = token.split(".");
  if (parts.length !== 3 || !opts.nonce) return { ok: false, error: "bad_proof" };
  let header: { alg?: string; kid?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(b64urlDecode(parts[0]).toString("utf8")) as { alg?: string; kid?: string };
    payload = JSON.parse(b64urlDecode(parts[1]).toString("utf8")) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "bad_proof" };
  }
  if (header.alg !== "RS256") return { ok: false, error: "bad_proof" };
  const jwk = opts.keys.find((key) => key.kty === "RSA" && (!header.kid || key.kid === header.kid));
  if (!jwk) return { ok: false, error: "bad_proof" };
  let ok = false;
  try {
    ok = verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: "jwk" }), b64urlDecode(parts[2]));
  } catch {
    return { ok: false, error: "bad_proof" };
  }
  if (!ok) return { ok: false, error: "bad_proof" };
  if (payload.iss !== (opts.issuer ?? ISSUER)) return { ok: false, error: "bad_proof" };
  const aud = payload.aud;
  const audOk = aud === opts.clientId || (Array.isArray(aud) && aud.includes(opts.clientId));
  if (!audOk) return { ok: false, error: "bad_proof" };
  if (typeof payload.exp !== "number" || typeof payload.iat !== "number") return { ok: false, error: "bad_proof" };
  const nowSec = Math.floor(opts.now / 1000);
  if (payload.exp <= nowSec) return { ok: false, error: "expired" };
  if (payload.iat > nowSec + 60) return { ok: false, error: "bad_proof" };
  if (payload.nonce !== opts.nonce) return { ok: false, error: "bad_proof" };
  const numeric = typeof payload.id === "number" && Number.isSafeInteger(payload.id) ? String(payload.id) : typeof payload.id === "string" ? payload.id : "";
  if (!/^\d{1,20}$/.test(numeric)) return { ok: false, error: "bad_proof" };
  return { ok: true, id: numeric };
}

const JWKS_TTL_MS = 10 * 60 * 1000;
let jwksCache: { url: string; at: number; keys: JsonWebKey[] } | null = null;

export function clearJwksCacheForTests(): void {
  jwksCache = null;
}

/** Timeout, cache, and a forced refresh when the token's kid is not in the cached set. */
export async function loadJwks(url: string, fetcher: typeof fetch, timeoutMs = 4000, force = false): Promise<JsonWebKey[]> {
  if (!force && jwksCache && jwksCache.url === url && Date.now() - jwksCache.at < JWKS_TTL_MS) return jwksCache.keys;
  const response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error("jwks");
  const body = (await response.json()) as { keys?: JsonWebKey[] };
  const keys = body.keys ?? [];
  jwksCache = { url, at: Date.now(), keys };
  return keys;
}
