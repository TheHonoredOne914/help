import { NextResponse, type NextRequest } from "next/server";
import { getContext, isSameOrigin, jsonError, readJson, SESSION_COOKIE } from "@/lib/server/bff";
import { getStore } from "@/lib/server/db";
import { envGet } from "@/lib/server/env-get";
import { getServerEnv } from "@/lib/server/env";
import { linkEmail, readSession } from "@/lib/server/store";

export async function POST(request: NextRequest) {
  if (getServerEnv().siteMode !== "public") return jsonError("not_found");
  if (!isSameOrigin(request)) return jsonError("forbidden");
  const account = readSession(getStore(), getContext(request).sessionId ?? request.cookies.get(SESSION_COOKIE)?.value ?? "", Date.now());
  if (!account) return jsonError("unauthorized");
  const body = (await readJson(request)) as { email?: unknown; code?: unknown } | null;
  const result = linkEmail(getStore(), {
    accountId: account.id,
    email: typeof body?.email === "string" ? body.email : "",
    code: typeof body?.code === "string" ? body.code : "",
    now: Date.now(),
    secret: envGet("ORASAKA_CODE_SECRET") ?? "",
  });
  if (!result.ok && result.error === "conflict") {
    return NextResponse.json(
      { error: "conflict", message: "Этот email уже привязан к другому аккаунту. Напишите в поддержку. Подписки не объединяются." },
      { status: 409, headers: { "cache-control": "private, no-store" } },
    );
  }
  if (!result.ok) return NextResponse.json({ error: "invalid_code" }, { status: 400, headers: { "cache-control": "private, no-store" } });
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
}
