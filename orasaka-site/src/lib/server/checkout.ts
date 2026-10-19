import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { Order } from "@/lib/api/types";
import { buildReturnUrl, getContext, IDEMPOTENCY_KEY_RE, isSameOrigin, jsonError, jsonResult, readJson } from "./bff";
import { getRuntime } from "./runtime";

const bodySchema = z.object({ planId: z.string().min(1).max(64), paymentMethod: z.string().min(1).max(32) });

/** Shared by new purchases and renewals: create order (idempotent), then start payment with the chosen adapter. */
export async function handleCheckout(request: NextRequest, kind: Order["kind"]) {
  if (!isSameOrigin(request)) return jsonError("forbidden");
  const { client, payments, registry } = getRuntime();
  if (!payments) return jsonError("payments_disabled");

  const idempotencyKey = request.headers.get("idempotency-key") ?? "";
  if (!IDEMPOTENCY_KEY_RE.test(idempotencyKey)) return jsonError("bad_request");
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError("bad_request");

  const method = registry.get(parsed.data.paymentMethod);
  if (!method || method.disabledReason() !== null) return jsonError("method_unavailable");

  const ctx = getContext(request);
  // Only planId + method cross the boundary; amount, duration and availability are resolved server-side.
  const input = { planId: parsed.data.planId, paymentMethod: method.id, idempotencyKey };
  const order = kind === "renewal" ? await client.subscription.renew(ctx, input) : await client.orders.create(ctx, input);
  if (!order.ok) return jsonResult(order);

  if (order.data.status !== "awaiting_payment") return jsonResult({ ok: true, data: { order: order.data, checkoutUrl: null } });
  const started = await payments.startPayment(order.data.id, method.id, buildReturnUrl(order.data.id));
  const fresh = await client.orders.get(ctx, order.data.id);
  if (!fresh.ok) return jsonResult(fresh);
  return jsonResult({ ok: true, data: { order: fresh.data, checkoutUrl: started.ok ? started.data.checkoutUrl : null } });
}
