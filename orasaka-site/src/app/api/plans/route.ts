import { connection } from "next/server";
import { jsonResult } from "@/lib/server/bff";
import { getRuntime } from "@/lib/server/runtime";

export async function GET() {
  await connection();
  return jsonResult(await getRuntime().client.plans.list());
}
