import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookie, getContext, isSameOrigin, jsonError } from "@/lib/server/bff";
import { getRuntime } from "@/lib/server/runtime";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("forbidden");
  await getRuntime().client.auth.logout(getContext(request));
  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
  clearSessionCookie(res);
  return res;
}
