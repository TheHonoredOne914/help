export const LOCALES = ["ru", "en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_COOKIE = "orasaka_lang";

export const LOCALE_OPTIONS: { id: Locale; code: string; name: string }[] = [
  { id: "ru", code: "RU", name: "Русский" },
  { id: "en", code: "EN", name: "English" },
  { id: "ja", code: "JA", name: "日本語" },
];

export const INTL_LOCALE: Record<Locale, string> = {
  ru: "ru-RU",
  en: "en-GB",
  ja: "ja-JP",
};

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}

export function isLocale(value: unknown): value is Locale {
  return value === "ru" || value === "en" || value === "ja";
}

/** Same-origin path only. Keeps the query and hash so a plan or returnTo survives a language change. */
export function safeReturn(raw: string): string {
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://") || raw.includes("\\") || raw.includes("\n")) return "/";
  if (!/^\/[A-Za-z0-9/_?=&%.~#-]*$/.test(raw)) return "/";
  return raw;
}
