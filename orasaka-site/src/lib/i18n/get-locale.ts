import "server-only";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, type Locale } from "./locale";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : "ru";
}
