import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin, jsonError, readJson, setSessionCookie } from "@/lib/server/bff";
import { getStore } from "@/lib/server/db";
import { envGet } from "@/lib/server/env-get";
import { getServerEnv } from "@/lib/server/env";
import { createSession, verifyEmail } from "@/lib/server/store";

export async function POST(request: NextRequest) {
  if (getServerEnv().siteMode !== "public") return jsonError("not_found");
  if (!isSameOrigin(request)) return jsonError("forbidden");
  const body = (await readJson(request)) as { email?: unknown; code?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const code = typeof body?.code === "string" ? body.code : "";
  const now = Date.now();
  const result = verifyEmail(getStore(), { email, code, now, secret: envGet("ORASAKA_CODE_SECRET") ?? "" });
  if (!result.ok) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400, headers: { "cache-control": "private, no-store" } });
  }
  const session = createSession(getStore(), result.accountId, now);
  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
  setSessionCookie(res, session.cookie, session.maxAge, request);
  return res;
}
