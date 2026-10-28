"use client";

import { createContext, useContext } from "react";
import type { Dict } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locale";

const LocaleContext = createContext<{ locale: Locale; dict: Dict } | null>(null);

export function LocaleProvider({ locale, dict, children }: { locale: Locale; dict: Dict; children: React.ReactNode }) {
  return <LocaleContext.Provider value={{ locale, dict }}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("LocaleProvider missing");
  return value.locale;
}

export function useDict(): Dict {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("LocaleProvider missing");
  return value.dict;
}
