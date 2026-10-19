import type { NextRequest } from "next/server";
import { getContext, isSameOrigin, isValidId, jsonError, jsonResult } from "@/lib/server/bff";
import { getRuntime } from "@/lib/server/runtime";

export async function DELETE(request: NextRequest, { params }: RouteContext<"/api/devices/[deviceId]">) {
  if (!isSameOrigin(request)) return jsonError("forbidden");
  const { deviceId } = await params;
  if (!isValidId(deviceId)) return jsonError("not_found");
  return jsonResult(await getRuntime().client.devices.remove(getContext(request), deviceId));
}
