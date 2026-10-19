import { z } from "zod";
import {
  getApiClient,
  getMockClient,
  getRequestContext,
  isSameOrigin,
  isValidOrderId,
  jsonError,
  jsonResult,
} from "@/lib/server/bff";

export async function GET(request: Request, { params }: RouteContext<"/api/orders/[orderId]">) {
  const { orderId } = await params;
  if (!isValidOrderId(orderId)) return jsonError("not_found");
  return jsonResult(await getApiClient().getOrder(getRequestContext(request), orderId));
}

const actionSchema = z.object({ action: z.enum(["cancel", "mock_pay"]) });

export async function POST(request: Request, { params }: RouteContext<"/api/orders/[orderId]">) {
  if (!isSameOrigin(request)) return jsonError("forbidden");
  const { orderId } = await params;
  if (!isValidOrderId(orderId)) return jsonError("not_found");

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("bad_request");
  const ctx = getRequestContext(request);

  if (parsed.data.action === "cancel") {
    return jsonResult(await getApiClient().cancelOrder(ctx, orderId));
  }

  // Simulated provider confirmation exists only in demo with PAYMENTS_MODE=mock.
  const mock = getMockClient();
  if (!mock) return jsonError("payments_disabled");
  return jsonResult(mock.simulatePayment(ctx, orderId));
}
