import { connection } from "next/server";
import { jsonResult } from "@/lib/server/bff";
import { getServerEnv } from "@/lib/server/env";
import { listPaymentMethods } from "@/lib/payments/registry";
import { getRuntime } from "@/lib/server/runtime";

export async function GET() {
  await connection();
  return jsonResult({
    ok: true,
    data: { mode: getServerEnv().paymentsMode, methods: listPaymentMethods(getRuntime().registry) },
  });
}
