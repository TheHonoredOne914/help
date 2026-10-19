import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { RequestContext } from "@/lib/api/client";
import { API_ERROR_STATUS, SOURCE_HEADER, type ApiErrorCode, type ApiResult } from "@/lib/api/types";
import { getServerEnv } from "./env";
import { getRuntime } from "./runtime";

export const SESSION_COOKIE = "orasaka_sid";

export function getContext(request: NextRequest): RequestContext {
  return { sessionId: request.cookies.get(SESSION_COOKIE)?.value ?? null };
}

export function setSessionCookie(res: NextResponse, sessionId: string, maxAgeSeconds: number) {
  res.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/** CSRF guard for cookie-authenticated mutations: require a same-origin Origin header. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

function headers() {
  return { "cache-control": "private, no-store", [SOURCE_HEADER]: getRuntime().client.source };
}

export function jsonError(error: ApiErrorCode) {
  return NextResponse.json({ error }, { status: API_ERROR_STATUS[error], headers: headers() });
}

export function jsonResult<T>(result: ApiResult<T>) {
  if (!result.ok) return jsonError(result.error);
  return NextResponse.json(result.data, { headers: headers() });
}

export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return null;
  const text = await request.text();
  if (text.length > 4096) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
export const isValidId = (id: string) => ID_RE.test(id);
export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9-]{16,64}$/;

/** The only return target providers may redirect to. */
export function buildReturnUrl(orderId: string): string {
  return `${getServerEnv().siteOrigin}/payment/return?orderId=${encodeURIComponent(orderId)}`;
}
