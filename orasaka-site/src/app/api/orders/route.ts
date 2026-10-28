import type { NextRequest } from "next/server";
import { getContext, jsonResult } from "@/lib/server/bff";
import { handleCheckout } from "@/lib/server/checkout";
import { getRuntime } from "@/lib/server/runtime";

export async function GET(request: NextRequest) {
  const res = await getRuntime().client.orders.list(getContext(request));
  return jsonResult(res.ok ? { ok: true, data: { orders: res.data } } : res);
}

export async function POST(request: NextRequest) {
  return handleCheckout(request, "new");
}
