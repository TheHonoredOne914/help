import { brand } from "@/config/brand";
import { monthsLabel } from "@/lib/months";
import { formatMoney } from "@/lib/money";
import { getServerEnv } from "@/lib/server/env";
import { getRuntime } from "@/lib/server/runtime";
import { DemoMarker } from "./demo-marker";
import { Tilt } from "./fx/tilt";
import { EmptyState, ErrorState } from "./states";
import { Badge, ButtonLink, ExternalButton } from "./ui";

/**
 * Plans are read on the server, so the home and pricing pages do not ship the
 * client fetch (zod + useApi) in the first script wave. The hover tilt stays a
 * small client child. Checkout still loads its own form.
 */
export async function PlansGrid({ headingLevel = 3 }: { headingLevel?: 2 | 3 }) {
  const { client } = getRuntime();
  const res = await client.plans.list();
  const H = `h${headingLevel}` as "h2" | "h3";
  if (!res.ok) return <ErrorState error={res.error} />;

  const { plans } = res.data;
  const siteCheckout = getServerEnv().paymentsMode === "mock";

  if (plans.length === 0) {
    return (
      <EmptyState title="Тарифы уточняются">
        <p>Актуальные тарифы — в Telegram-боте. На сайте они появятся позже.</p>
        <div className="mt-5 flex justify-center">
          <ExternalButton href={brand.telegramBot.url}>Посмотреть тарифы в боте</ExternalButton>
        </div>
      </EmptyState>
    );
  }

  return (
    <div>
      <div className="mb-4 flex min-h-6 flex-wrap items-center gap-3">
        <DemoMarker source={client.source} label="DEMO · суммы-заглушки, не цены" />
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan, i) => (
          <Tilt
            as="li"
            key={plan.id}
            className={`group flex flex-col overflow-hidden rounded-xl border bg-surface p-6 hover:-translate-y-1 ${
              i === 1 ? "border-brand/50" : "border-line"
            }`}
          >
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <div className="flex items-start justify-between gap-3">
              <H className="font-display text-lg font-semibold">{plan.title}</H>
              {plan.test ? <Badge tone="test">TEST</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-muted">Срок: {monthsLabel(plan.durationMonths)}</p>
            <dl className="mt-5 space-y-1">
              {plan.prices.map((price) => (
                <div key={price.currency} className="flex items-baseline justify-between gap-3">
                  <dt className="text-sm text-muted">{price.currency === "XTR" ? "Telegram Stars (в боте)" : "Рубли"}</dt>
                  <dd className="font-display text-2xl font-bold">{formatMoney(price)}</dd>
                </div>
              ))}
            </dl>
            {plan.conditions.length ? (
              <ul className="mt-4 space-y-1 text-sm text-muted">
                {plan.conditions.map((c) => (
                  <li key={c}>— {c}</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-auto pt-6">
              {siteCheckout && plan.prices.some((p) => p.currency === "RUB") ? (
                <ButtonLink href={`/checkout?plan=${encodeURIComponent(plan.id)}`} className="w-full">
                  Оформить (демо)
                </ButtonLink>
              ) : (
                <ExternalButton href={brand.telegramBot.url} className="w-full">
                  Оформить в боте
                </ExternalButton>
              )}
            </div>
          </Tilt>
        ))}
      </ul>
    </div>
  );
}
