import type { NextRequest } from "next/server";
import { getContext, jsonResult } from "@/lib/server/bff";
import { getRuntime } from "@/lib/server/runtime";

export async function GET(request: NextRequest) {
  return jsonResult(await getRuntime().client.auth.getSession(getContext(request)));
}
