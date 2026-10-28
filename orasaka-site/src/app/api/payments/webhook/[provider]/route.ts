import { NextResponse } from "next/server";
import { ingestNotification, runFulfillment } from "@/lib/server/billing";
import { ingestCryptoWebhook } from "@/lib/payments/cryptopay-flow";
import { isValidId, jsonError } from "@/lib/server/bff";
import { getStore } from "@/lib/server/db";
import { getServerEnv } from "@/lib/server/env";
import { readCryptoConfig } from "@/lib/payments/cryptopay-api";
import { readYooConfig } from "@/lib/payments/yookassa-api";
import { getRuntime } from "@/lib/server/runtime";
import { cryptoChargeReady, paymentsReady } from "@/lib/payments/ready";
import { currentAdapter } from "@/lib/vpn/http-adapter";

const MAX_BODY = 16 * 1024;

/**
 * Provider → server webhook. Raw body is kept for signature checks; the event
 * only triggers a re-fetch from the provider (see PaymentService.handleWebhook).
 * Only enabled adapters are accepted — in this build that is the demo mock provider.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/payments/webhook/[provider]">) {
  const { provider } = await params;
  if (provider === "cryptopay" && getServerEnv().siteMode === "public") {
    if (!cryptoChargeReady()) return jsonError("not_found");
    const config = readCryptoConfig();
    if (!config) return jsonError("not_found");
    const raw = await request.text();
    if (raw.length > MAX_BODY) return jsonError("bad_request");
    const store = getStore();
    const now = Date.now();
    const result = await ingestCryptoWebhook(store, config, raw, request.headers.get("crypto-pay-api-signature"), now);
    if (result.result === "rejected") return jsonError(result.reason === "signature" ? "forbidden" : "verification_failed");
    if (result.result === "paid") await runFulfillment(store, currentAdapter(), now);
    return NextResponse.json({ received: true, duplicate: result.result === "paid" ? result.duplicate : result.result === "review" });
  }
  if (provider === "yookassa" && getServerEnv().siteMode === "public") {
    if (!paymentsReady()) return jsonError("not_found");
    const config = readYooConfig();
    if (!config) return jsonError("not_found");
    if (!request.headers.get("content-type")?.startsWith("application/json")) return jsonError("bad_request");
    const raw = await request.text();
    if (raw.length > MAX_BODY) return jsonError("bad_request");
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return jsonError("bad_request");
    }
    const store = getStore();
    const now = Date.now();
    const result = await ingestNotification(store, config, body, now);
    if (result.result === "rejected") return jsonError("verification_failed");
    if (result.result === "paid") {
      await runFulfillment(store, currentAdapter(), now);
    }
    return NextResponse.json({ received: true, duplicate: result.result === "paid" ? result.duplicate : false });
  }
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
