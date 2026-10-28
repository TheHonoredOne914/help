import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { DeferredCursor } from "@/components/fx/deferred-fx";
import { LocaleProvider } from "@/components/locale-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { dictionary } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/get-locale";
import { SESSION_COOKIE } from "@/lib/server/bff";
import { getStore } from "@/lib/server/db";
import { getServerEnv } from "@/lib/server/env";
import { readSession, requestNow } from "@/lib/server/store";
import "./globals.css";

// The language cookie is read before the first byte so `html lang` matches the page.
// A streamed shell would paint the wrong language and then swap it.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const d = dictionary(await getLocale());
  return {
    title: { default: d.meta.title, template: `%s · ORASAKA` },
    description: d.meta.description,
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#070707",
  colorScheme: "dark",
};

async function PublicHeader() {
  await connection();
  const sid = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  const account = sid ? readSession(getStore(), sid, requestNow()) : null;
  return <SiteHeader loggedIn={Boolean(account)} />;
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  const locale = await getLocale();
  const dict = dictionary(locale);
  const env = getServerEnv();
  const isDemo = env.siteMode === "demo";
  return (
    <html lang={locale} data-theme="dark" className="antialiased">
      <head>
        <link rel="preload" href="/fonts/jetbrains-cyrillic.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/jetbrains-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/golos-400-cyrillic.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/golos-400-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/orasaka-marks.woff2" as="font" type="font/woff2" crossOrigin="" />
        {locale === "ja" ? (
          <>
            <link rel="preload" href="/fonts/noto-sans-jp-a.woff2" as="font" type="font/woff2" crossOrigin="" />
            <link rel="preload" href="/fonts/noto-sans-jp-b.woff2" as="font" type="font/woff2" crossOrigin="" />
          </>
        ) : null}
      </head>
      <body>
        <LocaleProvider locale={locale} dict={dict}>
          <div className="orasaka-shell">
            <div className="screen-grain" aria-hidden="true" />
            <div className="orasaka-content flex min-h-dvh flex-col">
              <a href="#main" className="sr-only z-50 rounded-md bg-accent-strong px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
                {dict.a11y.skip}
              </a>
              {isDemo ? (
                <div role="note" className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-xs font-medium text-warning sm:text-sm">
                  <span aria-hidden="true">⚠ </span>
                  {env.paymentsMode === "mock" ? dict.demo.pay : dict.demo.off}
                </div>
              ) : null}
              {env.siteMode === "public" ? (
                <Suspense fallback={<SiteHeader loggedIn={false} />}>
                  <PublicHeader />
                </Suspense>
              ) : (
                <SiteHeader loggedIn />
              )}
              <main id="main" tabIndex={-1} className="flex-1 outline-none">
                {children}
              </main>
              <SiteFooter />
            </div>
            <DeferredCursor />
          </div>
        </LocaleProvider>
      </body>
    </html>
  );
}
