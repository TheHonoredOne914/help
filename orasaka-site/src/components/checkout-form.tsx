"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { brand } from "@/config/brand";
import {
  API_ERROR_MESSAGE,
  checkoutResponseSchema,
  paymentMethodsResponseSchema,
  plansResponseSchema,
  type PaymentMethod,
} from "@/lib/api/types";
import { postJson } from "@/lib/fetch-json";
import { formatMoney } from "@/lib/money";
import { useApi } from "@/lib/use-api";
import { DemoMarker } from "./demo-marker";
import { monthsLabel } from "./plans-grid";
import { EmptyState, ErrorState, LoadingCards } from "./states";
import { Badge, Button, Card, ExternalButton } from "./ui";

const METHOD_STATUS: Record<PaymentMethod["status"], { label: string; tone: "success" | "pending" | "neutral" }> = {
  enabled: { label: "Доступно", tone: "success" },
  pending_integration: { label: "Интеграция в работе", tone: "pending" },
  disabled: { label: "Отключено", tone: "neutral" },
  bot_only: { label: "Только в боте", tone: "neutral" },
};

export function CheckoutForm({ initialPlan, renew }: { initialPlan: string | null; renew: boolean }) {
  const plans = useApi("/api/plans", plansResponseSchema);
  const methods = useApi("/api/payments/methods", paymentMethodsResponseSchema);
  const [planId, setPlanId] = useState<string | null>(initialPlan);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per (plan, method, kind) selection: retries and double submits hit the same order.
  const keys = useRef(new Map<string, string>());
  const router = useRouter();

  if (plans.state.status === "loading" || methods.state.status === "loading") return <LoadingCards label="Загружаем условия…" />;
  if (plans.state.status === "error") return <ErrorState error={plans.state.error} onRetry={() => plans.reload()} />;
  if (methods.state.status === "error") return <ErrorState error={methods.state.error} onRetry={() => methods.reload()} />;

  const { mode, methods: list } = methods.state.data;
  const available = plans.state.data.plans.filter((p) => p.prices.some((x) => x.currency === "RUB"));
  const selectedPlan = available.find((p) => p.id === planId) ?? null;
  const enabled = list.filter((m) => m.status === "enabled");
  const selectedMethod = enabled.find((m) => m.id === methodId) ?? (enabled.length === 1 ? enabled[0] : null);

  if (mode === "disabled" || available.length === 0) {
    return (
      <EmptyState title="Оплата на сайте отключена">
        <p>Оформить и продлить подписку можно в Telegram-боте. Онлайн-оплата на сайте появится после подключения платёжных сервисов.</p>
        <div className="mt-5 flex justify-center">
          <ExternalButton href={brand.telegramBot.url}>Оформить в боте</ExternalButton>
        </div>
      </EmptyState>
    );
  }

  async function submit() {
    if (!selectedPlan || !selectedMethod || busy) return;
    const slot = `${renew ? "renewal" : "new"}:${selectedPlan.id}:${selectedMethod.id}`;
    let key = keys.current.get(slot);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(slot, key);
    }
    setBusy(true);
    setError(null);
    const res = await postJson(
      renew ? "/api/subscription/renew" : "/api/orders",
      checkoutResponseSchema,
      { planId: selectedPlan.id, paymentMethod: selectedMethod.id },
      { "idempotency-key": key },
    );
    // Reset before navigating: the route may be restored from a hidden Activity on "back".
    setBusy(false);
    if (!res.ok) return setError(API_ERROR_MESSAGE[res.error]);
    router.push(res.data.checkoutUrl ?? `/checkout/${encodeURIComponent(res.data.order.id)}`);
  }

  return (
    <form
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="min-w-0 space-y-6">
        <fieldset>
          <legend className="mb-3 flex flex-wrap items-center gap-3 font-display text-lg font-semibold">
            1. Срок подписки <DemoMarker source={plans.state.source} label="DEMO · суммы-заглушки" />
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {available.map((p) => {
              const rub = p.prices.find((x) => x.currency === "RUB")!;
              return (
                <label
                  key={p.id}
                  className="flex cursor-pointer flex-col rounded-lg border border-line bg-surface p-4 transition-colors duration-150 hover:border-accent/60 has-[:checked]:border-accent has-[:checked]:bg-accent/5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
                >
                  <input
                    type="radio"
                    name="plan"
                    value={p.id}
                    checked={planId === p.id}
                    onChange={() => setPlanId(p.id)}
                    className="sr-only"
                  />
                  <span className="font-semibold">{p.title}</span>
                  <span className="text-sm text-muted">{monthsLabel(p.durationMonths)}</span>
                  <span className="mt-2 font-display text-xl font-bold">{formatMoney(rub)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 font-display text-lg font-semibold">2. Способ оплаты</legend>
          <ul className="space-y-3">
            {list.map((m) => {
              const meta = METHOD_STATUS[m.status];
              const disabled = m.status !== "enabled";
              return (
                <li key={m.id}>
                  <label
                    className={`flex items-start gap-4 rounded-lg border p-4 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                      disabled
                        ? "cursor-not-allowed border-line/60 opacity-60"
                        : "cursor-pointer border-line bg-surface hover:border-accent/60 has-[:checked]:border-accent has-[:checked]:bg-accent/5"
                    }`}
                  >
                    <input
                      type="radio"
                      name="method"
                      value={m.id}
                      disabled={disabled}
                      checked={selectedMethod?.id === m.id}
                      onChange={() => setMethodId(m.id)}
                      className="mt-1 size-4 accent-[var(--color-accent)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{m.label}</span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {m.test ? <Badge tone="test">TEST</Badge> : null}
                      </span>
                      <span className="mt-1 block text-sm leading-relaxed text-muted">{m.description}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      </div>

      <Card className="h-fit lg:sticky lg:top-24">
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted">{renew ? "Продление" : "Новая подписка"}</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Тариф</dt>
            <dd>{selectedPlan?.title ?? "не выбран"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Оплата</dt>
            <dd className="text-right">{selectedMethod?.label ?? "не выбрана"}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-line pt-3">
            <dt className="text-muted">Итого</dt>
            <dd className="font-display text-xl font-bold">
              {selectedPlan ? formatMoney(selectedPlan.prices.find((x) => x.currency === "RUB")!) : "—"}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Итоговую сумму фиксирует сервер при создании заказа. {renew ? "Срок добавится к текущей подписке." : ""}
        </p>
        <Button type="submit" className="mt-5 w-full" disabled={!selectedPlan || !selectedMethod || busy} aria-busy={busy}>
          {busy ? "Создаём заказ…" : "Перейти к оплате"}
        </Button>
        <p role="alert" className="mt-3 text-sm text-accent empty:hidden">
          {error}
        </p>
        <p className="mt-4 font-mono text-xs text-warning">⚠ DEMO: реальные деньги не списываются.</p>
      </Card>
    </form>
  );
}
