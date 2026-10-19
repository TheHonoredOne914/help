import type { Metadata } from "next";
import { BannerFigure } from "@/components/banner-figure";
import { FaqList } from "@/components/faq-list";
import { Card, Container, ExternalButton, PageHeader } from "@/components/ui";
import { banners, brand } from "@/config/brand";
import { faqHighlights } from "@/config/content";
import Link from "next/link";

export const metadata: Metadata = { title: "Поддержка" };

const topics = ["Вопросы по подключению", "Вопросы по оплате", "Техническая помощь"];

export default function SupportPage() {
  return (
    <>
      <PageHeader
        eyebrow="Поддержка"
        title="Поддержка в Telegram"
        lead={`Единственный официальный канал связи — бот ${brand.telegramBot.handle}.`}
      />
      <Container className="grid items-start gap-10 py-14 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-xl font-semibold">Написать в поддержку</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Откройте бота и выберите раздел поддержки. Чтобы ответ был быстрее, укажите устройство, приложение и что
            происходит при подключении. Никому не пересылайте ссылку подписки целиком.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2">
            {topics.map((t) => (
              <li key={t} className="rounded-full border border-line px-3 py-1 text-sm text-muted">
                {t}
              </li>
            ))}
          </ul>
          <ExternalButton href={brand.telegramBot.url} className="mt-6">
            Открыть {brand.telegramBot.handle}
          </ExternalButton>
        </Card>
        <BannerFigure image={banners.support} />
      </Container>
      <Container>
        <section aria-labelledby="support-faq">
          <h2 id="support-faq" className="mb-6 font-display text-2xl font-bold">
            Частые вопросы
          </h2>
          <FaqList items={faqHighlights} />
          <Link href="/faq" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline">
            Все вопросы →
          </Link>
        </section>
      </Container>
    </>
  );
}
