import type { NextRequest } from "next/server";
import { z } from "zod";
import { isSameOrigin, isValidId, jsonError, jsonResult, readJson } from "@/lib/server/bff";
import { getRuntime } from "@/lib/server/runtime";

/*
 * MOCK hosted-checkout backend. Stands in for the provider's own payment page;
 * exists only in demo with PAYMENTS_MODE=mock.
 */

function gatewayOrNull() {
  const { mock, payments } = getRuntime();
  return mock && payments ? { gateway: mock.gateway, payments } : null;
}

export async function GET(_request: NextRequest, { params }: RouteContext<"/api/pay/mock/[paymentId]">) {
  const { paymentId } = await params;
  const rt = gatewayOrNull();
  const p = rt && isValidId(paymentId) ? rt.gateway.get(paymentId) : null;
  if (!p) return jsonError("not_found");
  const status = p.status === "succeeded" || p.status === "canceled" ? p.status : "pending";
  return jsonResult({
    ok: true,
    data: { providerPaymentId: p.providerPaymentId, orderId: p.orderId, amount: p.amount, status, returnUrl: p.returnUrl },
  });
}

const bodySchema = z.object({ outcome: z.enum(["succeeded", "canceled"]) });

export async function POST(request: NextRequest, { params }: RouteContext<"/api/pay/mock/[paymentId]">) {
  if (!isSameOrigin(request)) return jsonError("forbidden");
  const { paymentId } = await params;
  const rt = gatewayOrNull();
  if (!rt || !isValidId(paymentId)) return jsonError("not_found");
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError("bad_request");

  const event = rt.gateway.complete(paymentId, parsed.data.outcome);
  if (!event) return jsonError("conflict");

  // The "provider" delivers its signed webhook a moment later, like a real one would.
  // The return page usually verifies first; both paths converge on the same single fulfilment.
  setTimeout(() => {
    rt.payments.handleWebhook("mock", event.body, event.headers).catch(() => {});
  }, 1500);

  const p = rt.gateway.get(paymentId)!;
  return jsonResult({ ok: true, data: { returnUrl: p.returnUrl } });
}
