import { NextResponse, type NextRequest } from "next/server";
import { isLocale, LOCALE_COOKIE, safeReturn } from "@/lib/i18n/locale";
import { isSameOrigin } from "@/lib/server/bff";
import { getServerEnv } from "@/lib/server/env";

/** Full navigation so the next document is rendered with the cookie already set. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const locale = String(form.get("locale") ?? "");
  const returnTo = safeReturn(String(form.get("returnTo") ?? "/"));
  const dest = new URL(returnTo, "http://local.invalid");
  const location = `${dest.pathname}${dest.search}${dest.hash}`;
  const res = new NextResponse(null, {
    status: 303,
    headers: { location, "cache-control": "private, no-store" },
  });
  if (!isSameOrigin(request) || !isLocale(locale)) return res;
  const secure = getServerEnv().siteOrigin.startsWith("https:");
  res.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure,
  });
  return res;
}
