import type { Metadata } from "next";
import { FaqList } from "@/components/faq-list";
import { Reveal } from "@/components/motion";
import { Card, Container, ExternalButton, PageHeader } from "@/components/ui";
import { brand } from "@/config/brand";
import { dictionary } from "@/lib/i18n/dictionaries";
import { buildFaq } from "@/lib/i18n/faq";
import { getLocale } from "@/lib/i18n/get-locale";
import { anyChargeReady } from "@/lib/payments/ready";
import { getServerEnv } from "@/lib/server/env";

export async function generateMetadata(): Promise<Metadata> {
  return { title: dictionary(await getLocale()).meta.faq };
}

export default async function FaqPage() {
  const locale = await getLocale();
  const d = dictionary(locale);
  const groups = buildFaq(d, locale, getServerEnv().siteMode === "public" && anyChargeReady(), brand.telegramBot.handle);
  return (
    <>
      <PageHeader eyebrow="FAQ" title={d.faq.title} lead={d.faq.lead} />
      <Container className="grid grid-cols-1 items-start gap-10 py-14 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label={d.faq.title} className="lg:sticky lg:top-24">
          <ul className="flex flex-wrap gap-2 lg:flex-col">
            {groups.map((g, i) => (
              <li key={g.id}>
                <a
                  href={`#${g.id}`}
                  className="flex min-h-11 items-center gap-3 rounded-md border border-line px-4 text-sm transition-colors duration-150 hover:border-accent/60 hover:text-accent"
                >
                  <span className="font-mono text-xs text-accent">/{String(i + 1).padStart(2, "0")}</span>
                  {g.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-12">
          {groups.map((g) => (
            <Reveal key={g.id}>
              <section id={g.id} aria-labelledby={`${g.id}-title`} className="scroll-mt-24">
                <h2 id={`${g.id}-title`} className="mb-5 font-display text-2xl font-bold">
                  {g.title}
                </h2>
                <FaqList items={g.items} />
              </section>
            </Reveal>
          ))}
          <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted">Не нашли ответ? Поддержка отвечает в Telegram.</p>
            <ExternalButton href={brand.telegramBot.url}>Написать в {brand.telegramBot.handle}</ExternalButton>
          </Card>
        </div>
      </Container>
    </>
  );
}
