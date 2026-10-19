import { NextResponse, type NextRequest } from "next/server";
import { SESSION_TTL_MS } from "@/lib/api/mock/mock-db";
import { isSameOrigin, jsonError, setSessionCookie } from "@/lib/server/bff";
import { getRuntime } from "@/lib/server/runtime";

/** MOCK: demo-only login that issues an isolated TEST user per visitor. Not Telegram auth. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("forbidden");
  const { mock } = getRuntime();
  if (!mock) return jsonError("not_found");
  const sid = mock.db.createSession(`demo-${crypto.randomUUID().slice(0, 8)}`);
  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store", "x-orasaka-source": "mock" } });
  setSessionCookie(res, sid, SESSION_TTL_MS / 1000);
  return res;
}
