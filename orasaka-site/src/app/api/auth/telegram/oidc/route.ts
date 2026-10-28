import { createHash, type JsonWebKey } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { loadJwks, verifyTelegramIdToken } from "@/lib/auth/telegram-oidc";
import { isSameOrigin, jsonError, LOGIN_ATTEMPT_COOKIE, SESSION_COOKIE, setSessionCookie } from "@/lib/server/bff";
import { getStore } from "@/lib/server/db";
import { envGet } from "@/lib/server/env-get";
import { getServerEnv } from "@/lib/server/env";
import { consumeLoginAttempt, createSession, linkTelegramId, loginTelegramId, readSession } from "@/lib/server/store";
import { oidcConfigured } from "@/lib/server/telegram-mode";
import { resolveTelegramVpn } from "@/lib/vpn/http-adapter";

const OFFICIAL = "https://oauth.telegram.org";
let keysFetch: typeof fetch = fetch;

/** Tests pass a local JWKS. Production uses the configured issuer, otherwise oauth.telegram.org. */
export function setTelegramJwksFetchForTests(next: typeof fetch | null): void {
  keysFetch = next ?? fetch;
}

function issuer(): string {
  return (envGet("TELEGRAM_OIDC_ISSUER") ?? OFFICIAL).replace(/\/$/, "");
}

async function keysFor(token: string, nonce: string, clientId: string, now: number): Promise<{ keys: JsonWebKey[]; verified: ReturnType<typeof verifyTelegramIdToken> }> {
  const url = `${issuer()}/.well-known/jwks.json`;
  const keys = await loadJwks(url, keysFetch);
  const first = verifyTelegramIdToken(token, { clientId, nonce, now, keys, issuer: issuer() });
  if (first.ok) return { keys, verified: first };
  const refreshed = await loadJwks(url, keysFetch, 4000, true);
  return { keys: refreshed, verified: verifyTelegramIdToken(token, { clientId, nonce, now, keys: refreshed, issuer: issuer() }) };
}

export async function POST(request: NextRequest) {
  if (getServerEnv().siteMode !== "public") return jsonError("not_found");
  if (!isSameOrigin(request)) return jsonError("forbidden");
  const oidc = oidcConfigured();
  if (!oidc) return jsonError("not_found");
  const nonce = request.cookies.get(LOGIN_ATTEMPT_COOKIE)?.value ?? "";
  const text = await request.text();
  if (text.length > 16_384) return jsonError("bad_request");
  let idToken = "";
  try {
    const body = JSON.parse(text) as { id_token?: unknown };
    if (typeof body.id_token === "string") idToken = body.id_token;
  } catch {
    return jsonError("bad_request");
  }
  if (!idToken) return jsonError("bad_request");
  const store = getStore();
  const now = Date.now();
  if (!consumeLoginAttempt(store, nonce, now)) {
    return NextResponse.json({ error: "invalid_proof" }, { status: 401, headers: { "cache-control": "private, no-store" } });
  }
  let verified: ReturnType<typeof verifyTelegramIdToken>;
  try {
    verified = (await keysFor(idToken, nonce, oidc.clientId, now)).verified;
  } catch {
    return jsonError("unavailable");
  }
  if (!verified.ok) {
    return NextResponse.json({ error: "invalid_proof" }, { status: 401, headers: { "cache-control": "private, no-store" } });
  }
  const proofHash = createHash("sha256").update(idToken).digest("hex");
  const identity = await resolveTelegramVpn(store, verified.id);
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  const linked = readSession(store, sessionId, now);
  if (linked) {
    const result = linkTelegramId(store, {
      accountId: linked.id,
      telegramId: verified.id,
      proofHash,
      now,
      vpnRef: identity.down ? null : identity.ref,
    });
    if (!result.ok) {
      const status = result.error === "conflict" ? 409 : 401;
      return NextResponse.json(
        { error: result.error, message: result.error === "conflict" ? "Этот Telegram уже связан с другим кабинетом. Напишите в поддержку." : undefined },
        { status, headers: { "cache-control": "private, no-store" } },
      );
    }
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
  }
  const result = loginTelegramId(store, {
    telegramId: verified.id,
    proofHash,
    now,
    vpnDown: identity.down,
    vpnRef: identity.down ? null : identity.ref,
  });
  if (!result.ok) {
    const status = result.error === "vpn_unavailable" ? 503 : result.error === "conflict" ? 409 : 401;
    const error = result.error === "vpn_unavailable" ? "unavailable" : result.error === "conflict" ? "conflict" : "invalid_proof";
    return NextResponse.json(
      { error, message: result.error === "conflict" ? "Этот Telegram уже связан с другим кабинетом. Напишите в поддержку." : undefined },
      { status, headers: { "cache-control": "private, no-store" } },
    );
  }
  const session = createSession(store, result.accountId, now);
  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
  setSessionCookie(res, session.cookie, session.maxAge, request);
  return res;
}
