import { connection } from "next/server";
import { getApiClient, jsonResult } from "@/lib/server/bff";
import { getServerEnv } from "@/lib/server/env";

export async function GET() {
  await connection();
  const result = await getApiClient().listPlans();
  const checkout = { mode: getServerEnv().paymentsMode };
  return jsonResult(result.ok ? { ok: true, data: { ...result.data, checkout } } : result, {
    "cache-control": "no-store",
  });
}
