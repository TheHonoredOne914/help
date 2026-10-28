import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin, jsonError, readJson } from "@/lib/server/bff";
import { getStore } from "@/lib/server/db";
import { envGet } from "@/lib/server/env-get";
import { siteProfile } from "@/lib/server/profile";
import { devMailbox } from "@/lib/server/store";

export async function POST(request: NextRequest) {
  if (siteProfile() !== "isolated" || envGet("MAIL_MODE") !== "dev") return jsonError("not_found");
  if (!isSameOrigin(request)) return jsonError("forbidden");
  const body = (await readJson(request)) as { email?: unknown } | null;
  const row = devMailbox(getStore(), typeof body?.email === "string" ? body.email : "");
  if (!row) return jsonError("not_found");
  return NextResponse.json({ code: row.code }, { headers: { "cache-control": "private, no-store" } });
}
