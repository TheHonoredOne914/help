import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin, jsonError, setLoginAttemptCookie } from "@/lib/server/bff";
import { getStore } from "@/lib/server/db";
import { getServerEnv } from "@/lib/server/env";
import { beginLoginAttempt } from "@/lib/server/store";
import { telegramMode } from "@/lib/server/telegram-mode";

export async function POST(request: NextRequest) {
  if (getServerEnv().siteMode !== "public") return jsonError("not_found");
  if (!isSameOrigin(request)) return jsonError("forbidden");
  const mode = telegramMode();
  if (mode.kind === "off" || mode.kind === "double") return jsonError("not_found");
  const started = beginLoginAttempt(getStore(), Date.now());
  const res = NextResponse.json(
    { nonce: started.nonce, clientId: mode.kind === "oidc" ? mode.clientId : null },
    { headers: { "cache-control": "private, no-store" } },
  );
  setLoginAttemptCookie(res, started.nonce, started.maxAge, request);
  return res;
}
