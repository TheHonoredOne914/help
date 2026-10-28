import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogCards } from "@/components/catalog-cards";
import { PlansGrid } from "@/components/plans-grid";
import { LoadingCards } from "@/components/states";
import { Card, Container, PageHeader } from "@/components/ui";
import { dictionary } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/get-locale";
import { anyChargeReady } from "@/lib/payments/ready";
import { getServerEnv } from "@/lib/server/env";

export async function generateMetadata(): Promise<Metadata> {
  return { title: dictionary(await getLocale()).meta.pricing };
}

const rules = [
  "Цена и срок фиксируются в заказе в момент оформления.",
  "Суммы в рублях и в Telegram Stars указываются раздельно и не пересчитываются друг в друга.",
  "Если условия изменились после выбора, новая сумма показывается для подтверждения до оплаты.",
  "Внутри Telegram оплата цифровых услуг — только через Telegram Stars в боте.",
  "Пополнение баланса на сайте не поддерживается: оплачивается конкретный заказ подписки.",
];

export default async function PricingPage() {
  const d = dictionary(await getLocale()).price;
  const pub = getServerEnv().siteMode === "public";
  const buyOnSite = pub && anyChargeReady();
  return (
    <>
      <PageHeader
        eyebrow={d.title}
        title={d.title}
        lead={pub ? (buyOnSite ? d.leadOn : d.leadOff) : d.leadDemo}
      />
      <Container className="py-14">
        {pub ? (
          <CatalogCards />
        ) : (
          <section aria-labelledby="plans-title">
            <h2 id="plans-title" className="sr-only">
              {d.plans}
            </h2>
            <Suspense fallback={<LoadingCards label="Загружаем тарифы…" />}>
              <PlansGrid />
            </Suspense>
          </section>
        )}

        <section aria-labelledby="rules-title" className="mt-16 grid items-start gap-10 lg:grid-cols-2">
          <Card>
            <h2 id="rules-title" className="font-display text-xl font-semibold">
              {d.rules}
            </h2>
            <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted">
              {(pub
                ? [d.ruleFull, d.ruleSave, buyOnSite ? d.ruleOn : d.ruleOff, d.ruleQuiet]
                : rules
              ).map((r) => (
                <li key={r} className="flex gap-3">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                  {r}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </Container>
    </>
  );
}
