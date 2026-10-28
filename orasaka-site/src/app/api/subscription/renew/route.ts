import type { NextRequest } from "next/server";
import { handleCheckout } from "@/lib/server/checkout";

export async function POST(request: NextRequest) {
  return handleCheckout(request, "renewal");
}
