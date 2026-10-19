import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getContext, isSameOrigin, jsonError, readJson } from "@/lib/server/bff";
import { getRuntime } from "@/lib/server/runtime";

const bodySchema = z.object({ preset: z.enum(["empty", "active", "provisioning"]) });

/** MOCK: resets the demo user's TEST data to a preset state. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("forbidden");
  const { mock } = getRuntime();
  if (!mock) return jsonError("not_found");
  const userId = mock.db.resolveSession(getContext(request).sessionId);
  if (!userId) return jsonError("unauthorized");
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError("bad_request");
  mock.db.applyPreset(userId, parsed.data.preset);
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store", "x-orasaka-source": "mock" } });
}
