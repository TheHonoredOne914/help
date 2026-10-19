import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope, Unbounded } from "next/font/google";
import { CyberBackground } from "@/components/fx/cyber-background";
import { CyberCursor } from "@/components/fx/cyber-cursor";
import { ScrollProgress } from "@/components/motion";
import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { brand } from "@/config/brand";
import { getServerEnv } from "@/lib/server/env";
import "./globals.css";

const unbounded = Unbounded({ variable: "--font-unbounded", subsets: ["latin", "cyrillic"], weight: ["500", "700", "800"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "cyrillic"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin", "cyrillic"], weight: ["400", "500"] });

const env = getServerEnv();
const isDemo = env.siteMode === "demo";

export const metadata: Metadata = {
  title: { default: `${brand.name} — VPN-подписка в Telegram`, template: `%s · ${brand.name}` },
  description: brand.description,
  // Not indexable until legal review and launch approval.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#080809",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${unbounded.variable} ${manrope.variable} ${jetbrains.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-accent-strong px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Перейти к содержимому
        </a>
        {isDemo ? (
          <div role="note" className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-xs font-medium text-warning sm:text-sm">
            <span aria-hidden="true">⚠ </span>
            {env.paymentsMode === "mock"
              ? "DEMO: тестовые данные и тестовая оплата — реальные деньги не списываются. Настоящая подписка оформляется в Telegram-боте."
              : "Демо-режим: данные тестовые, оплата на сайте отключена. Подписка оформляется в Telegram-боте."}
          </div>
        ) : null}
        <CyberBackground />
        <Providers>
          <ScrollProgress />
          <SiteHeader />
          <main id="main" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
          <SiteFooter />
        </Providers>
        <CyberCursor />
      </body>
    </html>
  );
}
