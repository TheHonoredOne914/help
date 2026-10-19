import "server-only";
import { NextResponse } from "next/server";
import type { RequestContext } from "@/lib/api/client";
import { DEMO_SCENARIOS, type DemoScenario } from "@/lib/api/client";
import { createLiveClient } from "@/lib/api/live-client";
import { createMockClient, DEMO_USER_ID } from "@/lib/api/mock-client";
import { API_ERROR_STATUS, type ApiErrorCode, type ApiResult } from "@/lib/api/types";
import { getServerEnv } from "./env";

export function getApiClient() {
  const env = getServerEnv();
  return env.siteMode === "demo"
    ? createMockClient({ fixtures: env.demoFixtures })
    : createLiveClient({ baseUrl: env.apiBaseUrl, timeoutMs: env.apiTimeoutMs });
}

export function getMockClient() {
  const env = getServerEnv();
  return env.siteMode === "demo" && env.paymentsMode === "mock"
    ? createMockClient({ fixtures: env.demoFixtures })
    : null;
}

/**
 * Demo uses one isolated fixture user. Live mode has no session yet: the
 * site auth flow must be agreed with the backend before user ids are resolved.
 */
export function getRequestContext(request: Request): RequestContext {
  const env = getServerEnv();
  if (env.siteMode !== "demo") return { userId: null };
  const raw = new URL(request.url).searchParams.get("scenario");
  const demoScenario = DEMO_SCENARIOS.find((s) => s.id === raw)?.id as DemoScenario | undefined;
  return { userId: DEMO_USER_ID, demoScenario };
}

/** CSRF guard for cookie-authenticated mutations: require a same-origin Origin header. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const PRIVATE_HEADERS = { "cache-control": "private, no-store" };

export function jsonError(error: ApiErrorCode) {
  return NextResponse.json({ error }, { status: API_ERROR_STATUS[error], headers: PRIVATE_HEADERS });
}

export function jsonResult<T>(result: ApiResult<T>, headers: Record<string, string> = PRIVATE_HEADERS) {
  if (!result.ok) return jsonError(result.error);
  return NextResponse.json(result.data, { headers });
}

const ORDER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const isValidOrderId = (id: string) => ORDER_ID_RE.test(id);
