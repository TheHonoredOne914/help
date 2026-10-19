import type { Metadata } from "next";
import { BannerFigure } from "@/components/banner-figure";
import { PlansGrid } from "@/components/plans-grid";
import { Card, Container, PageHeader } from "@/components/ui";
import { banners } from "@/config/brand";

export const metadata: Metadata = { title: "Тарифы" };

const rules = [
  "Цена, срок и доступность тарифа рассчитываются сервером в момент оформления заказа; сайт не хранит цены у себя.",
  "Суммы в рублях и в Telegram Stars указываются раздельно и не пересчитываются друг в друга.",
  "Если условия изменились после выбора, новая сумма показывается для подтверждения до оплаты.",
  "Внутри Telegram оплата цифровых услуг — только через Telegram Stars в боте.",
  "Пополнение баланса на сайте не поддерживается: оплачивается конкретный заказ подписки.",
];

export default function PricingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Тарифы"
        title="Тарифы ORASAKA VPN"
        lead="Список формируется сервером подписок. Если тарифов нет, значит они ещё не подключены к сайту — актуальные условия смотрите в боте."
      />
      <Container className="py-14">
        <section aria-labelledby="plans-title">
          <h2 id="plans-title" className="sr-only">
            Доступные тарифы
          </h2>
          <PlansGrid />
        </section>

        <section aria-labelledby="rules-title" className="mt-16 grid items-start gap-10 lg:grid-cols-2">
          <Card>
            <h2 id="rules-title" className="font-display text-xl font-semibold">
              Условия и ограничения
            </h2>
            <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted">
              {rules.map((r) => (
                <li key={r} className="flex gap-3">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                  {r}
                </li>
              ))}
            </ul>
          </Card>
          <BannerFigure image={banners.tariffs} />
        </section>
      </Container>
    </>
  );
}
