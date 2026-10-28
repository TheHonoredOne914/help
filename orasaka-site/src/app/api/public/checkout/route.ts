import { NextResponse, type NextRequest } from "next/server";
import { IDEMPOTENCY_KEY_RE, isSameOrigin, jsonError, readJson, SESSION_COOKIE } from "@/lib/server/bff";
import { getStore } from "@/lib/server/db";
import { getServerEnv } from "@/lib/server/env";
import { readCryptoConfig } from "@/lib/payments/cryptopay-api";
import { readYooConfig } from "@/lib/payments/yookassa-api";
import { startSiteCheckout, type CheckoutMethod } from "@/lib/server/public-checkout";
import { readSession } from "@/lib/server/store";

export async function POST(request: NextRequest) {
  if (getServerEnv().siteMode !== "public") return jsonError("not_found");
  if (!isSameOrigin(request)) return jsonError("forbidden");
  const store = getStore();
  const now = Date.now();
  const account = readSession(store, request.cookies.get(SESSION_COOKIE)?.value ?? "", now);
  if (!account) return jsonError("unauthorized");
  const body = (await readJson(request)) as { planId?: unknown; idempotencyKey?: unknown; method?: unknown } | null;
  const planId = typeof body?.planId === "string" ? body.planId : "";
  const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey : "";
  const method: CheckoutMethod | undefined = body?.method === "cryptopay" || body?.method === "yookassa" ? body.method : undefined;
  if (body?.method !== undefined && !method) return jsonError("bad_request");
  if (!IDEMPOTENCY_KEY_RE.test(idempotencyKey)) return jsonError("bad_request");
  const headerOrigin = request.headers.get("origin");
  // nextUrl.origin can be localhost while the browser is on 127.0.0.1. The cookie would not come back.
  const origin = getServerEnv().siteOrigin || (headerOrigin ? new URL(headerOrigin).origin : request.nextUrl.origin);
  const result = await startSiteCheckout(store, {
    accountId: account.id,
    planId,
    idempotencyKey,
    origin,
    now,
    config: readYooConfig(),
    method,
    crypto: readCryptoConfig(),
  });
  if (!result.ok) {
    const status = result.error === "payments_off" ? 404 : result.error === "unknown_plan" || result.error === "bad_key" ? 400 : 409;
    return NextResponse.json({ error: result.error }, { status, headers: { "cache-control": "private, no-store" } });
  }
  return NextResponse.json(
    { orderId: result.orderId, amountMinor: result.amountMinor, checkoutUrl: result.checkoutUrl, timedOut: Boolean(result.timedOut) },
    { headers: { "cache-control": "private, no-store" } },
  );
}
