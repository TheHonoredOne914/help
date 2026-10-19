import { z } from "zod";
import { getApiClient, getRequestContext, isSameOrigin, jsonError, jsonResult } from "@/lib/server/bff";
import { getServerEnv } from "@/lib/server/env";

const bodySchema = z.object({ planId: z.string().min(1).max(64) });
const KEY_RE = /^[A-Za-z0-9-]{16,64}$/;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("forbidden");
  if (getServerEnv().paymentsMode === "disabled") return jsonError("payments_disabled");

  const idempotencyKey = request.headers.get("idempotency-key") ?? "";
  if (!KEY_RE.test(idempotencyKey)) return jsonError("bad_request");
  if (!request.headers.get("content-type")?.startsWith("application/json")) return jsonError("bad_request");

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("bad_request");

  // Only the plan id crosses the boundary; price, duration and availability are resolved server-side.
  return jsonResult(
    await getApiClient().createOrder(getRequestContext(request), {
      planId: parsed.data.planId,
      idempotencyKey,
    }),
  );
}
