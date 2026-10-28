import { NextResponse, type NextRequest } from "next/server";
import { DOUBLE_AUD, stringFields } from "@/lib/auth/telegram";
import { isSameOrigin, jsonError, LOGIN_ATTEMPT_COOKIE, readJson, SESSION_COOKIE } from "@/lib/server/bff";
import { getStore } from "@/lib/server/db";
import { envGet } from "@/lib/server/env-get";
import { getServerEnv } from "@/lib/server/env";
import { siteProfile } from "@/lib/server/profile";
import { consumeLoginAttempt, linkTelegram, readSession } from "@/lib/server/store";
import { doubleIsDown, doubleRefForTelegram } from "@/lib/vpn/adapter";

export async function POST(request: NextRequest) {
  if (getServerEnv().siteMode !== "public") return jsonError("not_found");
  if (!isSameOrigin(request)) return jsonError("forbidden");
  const store = getStore();
  const now = Date.now();
  const account = readSession(store, request.cookies.get(SESSION_COOKIE)?.value ?? "", now);
  if (!account) return jsonError("unauthorized");
  const allowDouble = siteProfile() === "isolated" && envGet("VPN_MODE") === "double";
  const botToken = envGet("TELEGRAM_BOT_TOKEN") ?? null;
  if (!allowDouble && !botToken) return jsonError("not_found");
  if (allowDouble && doubleIsDown(store)) return jsonError("unavailable");
  const fields = stringFields(await readJson(request));
  if (!fields) return jsonError("bad_request");
  if (fields.aud !== DOUBLE_AUD) {
    const nonce = request.cookies.get(LOGIN_ATTEMPT_COOKIE)?.value ?? "";
    if (!consumeLoginAttempt(store, nonce, now)) {
      return NextResponse.json({ error: "invalid_proof" }, { status: 401, headers: { "cache-control": "private, no-store" } });
    }
  }
  const result = linkTelegram(store, {
    accountId: account.id,
    fields,
    now,
    doubleSecret: envGet("ORASAKA_DOUBLE_SECRET") ?? null,
    botToken,
    allowDouble,
    vpnRefForTelegram: allowDouble ? doubleRefForTelegram(store, fields.id) : null,
  });
  if (!result.ok && result.error === "conflict") {
    return NextResponse.json(
      { error: "conflict", message: "Этот Telegram уже привязан к другому аккаунту. Напишите в поддержку. Подписки не объединяются." },
      { status: 409, headers: { "cache-control": "private, no-store" } },
    );
  }
  if (!result.ok) return NextResponse.json({ error: "invalid_proof" }, { status: 401, headers: { "cache-control": "private, no-store" } });
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
}
