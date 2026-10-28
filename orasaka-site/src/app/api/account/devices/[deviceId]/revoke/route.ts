import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin, jsonError, SESSION_COOKIE } from "@/lib/server/bff";
import { getStore } from "@/lib/server/db";
import { getServerEnv } from "@/lib/server/env";
import { readSession } from "@/lib/server/store";
import { currentAdapter } from "@/lib/vpn/http-adapter";

export async function POST(request: NextRequest, { params }: { params: Promise<{ deviceId: string }> }) {
  if (getServerEnv().siteMode !== "public") return jsonError("not_found");
  if (!isSameOrigin(request)) return jsonError("forbidden");
  const store = getStore();
  const now = Date.now();
  const account = readSession(store, request.cookies.get(SESSION_COOKIE)?.value ?? "", now);
  if (!account?.vpn_user_ref) return jsonError("not_found");
  const { deviceId } = await params;
  if (!deviceId || deviceId.length > 80) return jsonError("bad_request");
  const adapter = currentAdapter();
  if (!adapter.revokeDevice) return jsonError("not_found");
  const result = await adapter.revokeDevice(account.vpn_user_ref, deviceId);
  if (!result.ok) return jsonError(result.error === "not_found" ? "not_found" : result.error === "forbidden" ? "forbidden" : "unavailable");
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
}
