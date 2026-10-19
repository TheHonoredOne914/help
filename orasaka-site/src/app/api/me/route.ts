import { getApiClient, getRequestContext, jsonResult } from "@/lib/server/bff";

export async function GET(request: Request) {
  return jsonResult(await getApiClient().getAccount(getRequestContext(request)));
}
