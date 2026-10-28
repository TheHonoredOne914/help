import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { DOUBLE_AUD, stringFields } from "@/lib/auth/telegram";
import { isSameOrigin, jsonError, jsonResult, LOGIN_ATTEMPT_COOKIE, readJson, setSessionCookie } from "@/lib/server/bff";
import { getStore } from "@/lib/server/db";
import { envGet } from "@/lib/server/env-get";
import { getServerEnv } from "@/lib/server/env";
import { siteProfile } from "@/lib/server/profile";
import { getRuntime } from "@/lib/server/runtime";
import { consumeLoginAttempt, createSession, loginWithProof } from "@/lib/server/store";
import { doubleIsDown, doubleRefForTelegram } from "@/lib/vpn/adapter";

const payloadSchema = z.record(z.string(), z.string().max(512)).refine((p) => "hash" in p && "auth_date" in p && "id" in p);

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("forbidden");
  if (getServerEnv().siteMode !== "public") {
    const parsed = payloadSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("bad_request");
    const result = await getRuntime().client.auth.loginWithTelegram(parsed.data);
    if (!result.ok) return jsonResult(result);
    const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
    setSessionCookie(res, result.data.sessionId, 12 * 60 * 60, request);
    return res;
  }
  const allowDouble = siteProfile() === "isolated" && envGet("VPN_MODE") === "double";
  const botToken = envGet("TELEGRAM_BOT_TOKEN") ?? null;
  if (!allowDouble && !botToken) return jsonError("not_found");
  const fields = stringFields(await readJson(request));
  if (!fields) return jsonError("bad_request");
  const store = getStore();
  const now = Date.now();
  if (fields.aud !== DOUBLE_AUD) {
    const nonce = request.cookies.get(LOGIN_ATTEMPT_COOKIE)?.value ?? "";
    if (!consumeLoginAttempt(store, nonce, now)) return privateJson({ error: "invalid_proof" }, 401);
  }
  const vpnDown = allowDouble ? doubleIsDown(store) : true;
  const vpnRef = allowDouble && !vpnDown ? doubleRefForTelegram(store, fields.id) : null;
  const result = loginWithProof(store, {
    fields,
    now,
    doubleSecret: envGet("ORASAKA_DOUBLE_SECRET") ?? null,
    botToken,
    allowDouble,
    vpnDown,
    vpnRef,
  });
  if (!result.ok && result.error === "vpn_unavailable") return jsonError("unavailable");
  if (!result.ok && result.error === "conflict") {
    return privateJson({ error: "conflict", message: "Этот Telegram уже связан с другим кабинетом. Напишите в поддержку." }, 409);
  }
  if (!result.ok) return privateJson({ error: "invalid_proof" }, 401);
  const session = createSession(store, result.accountId, now);
  const res = privateJson({ ok: true });
  setSessionCookie(res, session.cookie, session.maxAge, request);
  return res;
}
