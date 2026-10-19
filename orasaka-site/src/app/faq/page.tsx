import type { Metadata } from "next";
import { FaqList } from "@/components/faq-list";
import { Reveal } from "@/components/motion";
import { Card, Container, ExternalButton, PageHeader } from "@/components/ui";
import { brand } from "@/config/brand";
import { faqGroups } from "@/config/content";

export const metadata: Metadata = { title: "Частые вопросы" };

export default function FaqPage() {
  return (
    <>
      <PageHeader eyebrow="FAQ" title="Частые вопросы" lead="Подписка, подключение, оплата и кабинет — коротко и по делу." />
      <Container className="grid grid-cols-1 items-start gap-10 py-14 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Разделы FAQ" className="lg:sticky lg:top-24">
          <ul className="flex flex-wrap gap-2 lg:flex-col">
            {faqGroups.map((g, i) => (
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
          {faqGroups.map((g) => (
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
