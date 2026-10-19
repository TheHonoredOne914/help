import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameOrigin, jsonError, jsonResult, readJson, setSessionCookie } from "@/lib/server/bff";
import { getRuntime } from "@/lib/server/runtime";

const payloadSchema = z.record(z.string(), z.string().max(512)).refine((p) => "hash" in p && "auth_date" in p && "id" in p);

/**
 * Telegram Login → backend session. The signature check (HMAC with SHA-256 of the bot token,
 * auth_date window, replay protection) belongs to FastAPI; this route only forwards the payload.
 * Currently returns `contract_unverified` until that endpoint exists.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("forbidden");
  const parsed = payloadSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError("bad_request");
  const result = await getRuntime().client.auth.loginWithTelegram(parsed.data);
  if (!result.ok) return jsonResult(result);
  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
  setSessionCookie(res, result.data.sessionId, 12 * 60 * 60);
  return res;
}
