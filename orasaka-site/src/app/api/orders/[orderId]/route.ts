import type { NextRequest } from "next/server";
import { z } from "zod";
import { buildReturnUrl, getContext, isSameOrigin, isValidId, jsonError, jsonResult, readJson } from "@/lib/server/bff";
import { getRuntime } from "@/lib/server/runtime";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/orders/[orderId]">) {
  const { orderId } = await params;
  if (!isValidId(orderId)) return jsonError("not_found");
  return jsonResult(await getRuntime().client.orders.get(getContext(request), orderId));
}

const actionSchema = z.object({ action: z.enum(["cancel", "pay", "verify"]) });

export async function POST(request: NextRequest, { params }: RouteContext<"/api/orders/[orderId]">) {
  if (!isSameOrigin(request)) return jsonError("forbidden");
  const { orderId } = await params;
  if (!isValidId(orderId)) return jsonError("not_found");
  const parsed = actionSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError("bad_request");

  const { client, payments } = getRuntime();
  const ctx = getContext(request);
  // Ownership first: the order must belong to the session user.
  const owned = await client.orders.get(ctx, orderId);
  if (!owned.ok) return jsonResult(owned);

  if (parsed.data.action === "cancel") {
    return jsonResult(await client.orders.cancel(ctx, orderId));
  }
  if (!payments) return jsonError("payments_disabled");

  if (parsed.data.action === "pay") {
    const method = owned.data.paymentMethod;
    if (!method) return jsonError("method_unavailable");
    const started = await payments.startPayment(orderId, method, buildReturnUrl(orderId));
    if (!started.ok) return jsonError(started.error);
    return jsonResult({ ok: true, data: { order: owned.data, checkoutUrl: started.data.checkoutUrl } });
  }

  const verified = await payments.verifyOrder(orderId);
  if (!verified.ok) return jsonError(verified.error);
  return jsonResult(await client.orders.get(ctx, orderId));
}
