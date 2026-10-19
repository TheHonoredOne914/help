"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { brand } from "@/config/brand";
import { API_ERROR_MESSAGE, orderSchema, plansResponseSchema } from "@/lib/api/types";
import { fetchJson } from "@/lib/fetch-json";
import { useApi } from "@/lib/use-api";
import { formatMoney } from "@/lib/money";
import { EmptyState, ErrorState, LoadingCards } from "./states";
import { Badge, Button, ExternalButton } from "./ui";

function monthsLabel(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} месяц`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} месяца`;
  return `${n} месяцев`;
}

export function PlansGrid({ headingLevel = 3 }: { headingLevel?: 2 | 3 }) {
  const { state, reload } = useApi("/api/plans", plansResponseSchema);
  const [pending, setPending] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const keys = useRef(new Map<string, string>());
  const router = useRouter();
  const H = `h${headingLevel}` as "h2" | "h3";

  async function order(planId: string) {
    if (pending) return;
    // One idempotency key per plan selection, reused on retries/double clicks.
    let key = keys.current.get(planId);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(planId, key);
    }
    setPending(planId);
    setOrderError(null);
    const res = await fetchJson("/api/orders", orderSchema, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify({ planId }),
    });
    setPending(null);
    if (res.ok) router.push(`/checkout/${encodeURIComponent(res.data.id)}`);
    else setOrderError(API_ERROR_MESSAGE[res.error]);
  }

  if (state.status === "loading") return <LoadingCards label="Загружаем тарифы…" />;
  if (state.status === "error") return <ErrorState error={state.error} onRetry={() => reload()} />;

  const { plans, checkout } = state.data;
  if (plans.length === 0) {
    return (
      <EmptyState title="Тарифы уточняются">
        <p>Актуальные сроки и цены показывает Telegram-бот. На сайте они появятся после подключения к серверу тарифов.</p>
        <div className="mt-5 flex justify-center">
          <ExternalButton href={brand.telegramBot.url}>Посмотреть тарифы в боте</ExternalButton>
        </div>
      </EmptyState>
    );
  }

  return (
    <div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <li key={plan.id} className="flex flex-col rounded-xl border border-line bg-surface p-6 transition-colors duration-150 hover:border-accent/60">
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
              {checkout.mode === "mock" && plan.prices.some((p) => p.currency === "RUB") ? (
                <Button className="w-full" onClick={() => order(plan.id)} disabled={pending !== null} aria-busy={pending === plan.id}>
                  {pending === plan.id ? "Создаём заказ…" : "Оформить (тест)"}
                </Button>
              ) : (
                <ExternalButton href={brand.telegramBot.url} className="w-full">
                  Оформить в боте
                </ExternalButton>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p role="status" aria-live="polite" className="mt-4 text-sm text-accent">
        {orderError}
      </p>
    </div>
  );
}
