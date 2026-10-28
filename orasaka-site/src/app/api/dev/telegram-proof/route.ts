import { NextResponse, type NextRequest } from "next/server";
import { mintDoubleProof } from "@/lib/auth/telegram";
import { isSameOrigin, jsonError, readJson } from "@/lib/server/bff";
import { getStore } from "@/lib/server/db";
import { envGet } from "@/lib/server/env-get";
import { siteProfile } from "@/lib/server/profile";
import { randomInt } from "node:crypto";

const FIXTURES = { paid: ["1001", "paid_user"], expired: ["1002", "expired_user"] } as const;

/** Stand-in for the Telegram widget. Only the isolated double, only fixed fixtures or a fresh id. */
export async function POST(request: NextRequest) {
  if (siteProfile() !== "isolated" || envGet("VPN_MODE") !== "double") return jsonError("not_found");
  const secret = envGet("ORASAKA_DOUBLE_SECRET");
  if (!secret) return jsonError("not_found");
  if (!isSameOrigin(request)) return jsonError("forbidden");
  const body = (await readJson(request)) as { fixture?: unknown; purpose?: unknown } | null;
  getStore();
  if (body?.fixture === "paid" || body?.fixture === "expired") {
    const [id, username] = FIXTURES[body.fixture];
    return NextResponse.json(mintDoubleProof(secret, id, username, Date.now()), { headers: { "cache-control": "private, no-store" } });
  }
  if (body?.purpose === "link") {
    const id = String(9_000_000 + randomInt(0, 1_000_000));
    return NextResponse.json(mintDoubleProof(secret, id, "linked_user", Date.now()), { headers: { "cache-control": "private, no-store" } });
  }
  return jsonError("bad_request");
}
