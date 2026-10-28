import Link from "next/link";
import { Suspense } from "react";
import { brand } from "@/config/brand";
import { dictionary } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/get-locale";
import { fill } from "@/lib/i18n/locale";
import { getServerEnv } from "@/lib/server/env";
import { paymentReadiness } from "@/lib/payments/ready";
import { AmbientToggle } from "./ambient-toggle";
import { LanguageSwitch } from "./language-switch";
import { ButtonLink, Container } from "./ui";
import { Wordmark } from "./wordmark";

export async function SiteFooter() {
  const d = dictionary(await getLocale());
  const ready = paymentReadiness();
  const methods = [
    ready.yookassa ? "ЮKassa" : null,
    ready.cryptopay ? "USDT" : null,
    "Telegram",
  ].filter((item): item is string => Boolean(item));
  const links = [
    { href: "/pricing", label: d.nav.pricing },
    { href: "/connect", label: d.nav.connect },
    { href: "/devices", label: d.nav.devices },
    { href: "/faq", label: d.nav.faq },
    { href: "/account", label: d.nav.account },
    { href: "/support", label: d.nav.support },
  ];
  const legal = [
    { href: "/legal/offer", label: d.legal.offer },
    { href: "/legal/privacy", label: d.legal.privacy },
    { href: "/legal/refunds", label: d.legal.refunds },
    { href: "/legal/contacts", label: d.legal.contacts },
  ];
  return (
    <footer className="mt-16 border-t border-line bg-transparent">
      <div className="foot-cta bg-[linear-gradient(135deg,#e5231b,#8c0f0f,#ff4433)] text-white">
        <Container className="flex flex-col items-start justify-between gap-4 py-6 sm:flex-row sm:items-center">
          <h2 id="final-title" className="max-w-[640px] font-mono text-[28px] font-extrabold leading-[1.1] text-white md:text-[34px] md:leading-[37.4px]">{d.final.title}</h2>
          <ButtonLink href="/pricing" size="header" className="border-0 bg-white text-[#1a0505] hover:bg-white">{d.final.cta}</ButtonLink>
        </Container>
      </div>
      <Container className="grid gap-8 py-10 md:grid-cols-4">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">{fill(d.footer.blurb, { bot: brand.telegramBot.handle })}</p>
          <a className="mt-4 inline-flex size-[42px] items-center justify-center rounded-[10px] border border-white/10 font-mono text-xs" href={brand.telegramBot.url}>TG</a>
        </div>
        <nav aria-label={d.nav.sections}>
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted">{d.nav.sections}</h2>
          <ul className="mt-3 space-y-1">
            {links.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="inline-flex min-h-9 items-center text-sm hover:text-accent">{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={d.nav.docs}>
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted">{d.nav.docs}</h2>
          <ul className="mt-3 space-y-1">
            {legal.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="inline-flex min-h-9 items-center text-sm hover:text-accent">{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
      <Container className="flex flex-col gap-3 border-t border-line py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          {brand.name}
          {getServerEnv().siteMode === "demo" ? `. ${d.footer.demo}` : "."}
        </p>
        <ul className="flex flex-wrap gap-2">
          {methods.map((method) => (
            <li key={method} className="rounded-[6px] border border-white/15 px-2.5 py-1 font-mono text-[10.5px]">{method}</li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Suspense fallback={null}>
            <LanguageSwitch />
          </Suspense>
          <AmbientToggle />
        </div>
      </Container>
    </footer>
  );
}
