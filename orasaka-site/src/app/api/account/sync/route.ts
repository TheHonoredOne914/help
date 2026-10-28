import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin, jsonError, SESSION_COOKIE } from "@/lib/server/bff";
import { getStore } from "@/lib/server/db";
import { getServerEnv } from "@/lib/server/env";
import { attachVpnRef, readSession } from "@/lib/server/store";
import { lookupVpnUser, readHttpVpnConfig, resolveTelegramVpn } from "@/lib/vpn/http-adapter";

export async function POST(request: NextRequest) {
  if (getServerEnv().siteMode !== "public") return jsonError("not_found");
  if (!isSameOrigin(request)) return jsonError("forbidden");
  const store = getStore();
  const now = Date.now();
  const account = readSession(store, request.cookies.get(SESSION_COOKIE)?.value ?? "", now);
  if (!account) return jsonError("unauthorized");
  let resolved: { down: boolean; ref: string | null };
  if (account.telegram_id) resolved = await resolveTelegramVpn(store, account.telegram_id);
  else if (account.email) {
    const cfg = readHttpVpnConfig();
    if (!cfg) resolved = { down: true, ref: null };
    else {
      const found = await lookupVpnUser(cfg, { email: account.email });
      resolved = found.kind === "error" ? { down: true, ref: null } : { down: false, ref: found.id };
    }
  } else resolved = { down: false, ref: null };
  if (resolved.down) return jsonError("unavailable");
  if (!resolved.ref) return NextResponse.json({ linked: false }, { headers: { "cache-control": "private, no-store" } });
  const attached = attachVpnRef(store, account.id, resolved.ref);
  if (!attached.ok) {
    return NextResponse.json(
      { error: "conflict", message: "Этот вход уже связан с другим кабинетом. Напишите в поддержку. Подписки не объединяются." },
      { status: 409, headers: { "cache-control": "private, no-store" } },
    );
  }
  return NextResponse.json({ linked: true }, { headers: { "cache-control": "private, no-store" } });
}
