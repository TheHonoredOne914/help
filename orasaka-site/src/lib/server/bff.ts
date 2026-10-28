import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { RequestContext } from "@/lib/api/client";
import { API_ERROR_STATUS, SOURCE_HEADER, type ApiErrorCode, type ApiResult } from "@/lib/api/types";
import { sessionCookieSecure } from "./cookie-secure";
import { getServerEnv } from "./env";
import { isAllowedOrigin } from "./origin";
import { getRuntime } from "./runtime";

export const SESSION_COOKIE = "orasaka_sid";
export const LOGIN_ATTEMPT_COOKIE = "orasaka_login";

export function getContext(request: NextRequest): RequestContext {
  return { sessionId: request.cookies.get(SESSION_COOKIE)?.value ?? null };
}

function cookieSecure(request: NextRequest) {
  const env = getServerEnv();
  return sessionCookieSecure({
    siteOrigin: env.siteOrigin,
    siteMode: env.siteMode,
    trustProxy: process.env.TRUST_PROXY === "1",
    hostname: request.nextUrl.hostname,
    protocol: request.nextUrl.protocol,
    forwardedProto: request.headers.get("x-forwarded-proto"),
  });
}

export function setSessionCookie(res: NextResponse, sessionId: string, maxAgeSeconds: number, request: NextRequest) {
  res.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: cookieSecure(request),
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export function setLoginAttemptCookie(res: NextResponse, nonce: string, maxAgeSeconds: number, request: NextRequest) {
  res.cookies.set(LOGIN_ATTEMPT_COOKIE, nonce, {
    httpOnly: true,
    secure: cookieSecure(request),
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export function clearSessionCookie(res: NextResponse, request: NextRequest) {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: cookieSecure(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** CSRF guard for cookie-authenticated mutations: the full Origin must match the site's allowed origin (see origin.ts). */
export function isSameOrigin(request: Request): boolean {
  return isAllowedOrigin(request.headers.get("origin"), request.headers.get("host"), getServerEnv().siteOrigin || null);
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
