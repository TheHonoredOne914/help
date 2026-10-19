import { NextResponse } from "next/server";
import { isValidId, jsonError } from "@/lib/server/bff";
import { getRuntime } from "@/lib/server/runtime";

const MAX_BODY = 16 * 1024;

/**
 * Provider → server webhook. Raw body is kept for signature checks; the event
 * only triggers a re-fetch from the provider (see PaymentService.handleWebhook).
 * Only enabled adapters are accepted — in this build that is the demo mock provider.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/payments/webhook/[provider]">) {
  const { provider } = await params;
  const { payments } = getRuntime();
  if (!payments || !isValidId(provider)) return jsonError("not_found");
  if (!request.headers.get("content-type")?.startsWith("application/json")) return jsonError("bad_request");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return jsonError("bad_request");

  const raw = await request.text();
  if (raw.length > MAX_BODY) return jsonError("bad_request");

  const result = await payments.handleWebhook(provider, raw, request.headers);
  if (!result.ok) return jsonError(result.error);
  return NextResponse.json({ received: true, duplicate: result.data.duplicate });
}
