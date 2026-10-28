import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookie, getContext, isSameOrigin, jsonError, SESSION_COOKIE } from "@/lib/server/bff";
import { getStore } from "@/lib/server/db";
import { getServerEnv } from "@/lib/server/env";
import { getRuntime } from "@/lib/server/runtime";
import { revokeSession } from "@/lib/server/store";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("forbidden");
  if (getServerEnv().siteMode === "public") revokeSession(getStore(), request.cookies.get(SESSION_COOKIE)?.value ?? "");
  else await getRuntime().client.auth.logout(getContext(request));
  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
  clearSessionCookie(res, request);
  return res;
}
