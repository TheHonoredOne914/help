"use client";

import { useEffect } from "react";
import { brand } from "@/config/brand";
import { orderSchema } from "@/lib/api/types";
import { formatMoney } from "@/lib/money";
import { isPolling } from "@/lib/order-status";
import { useApi } from "@/lib/use-api";
import { DemoMarker } from "./demo-marker";
import { OrderStatusBadge } from "./order-status-badge";
import { orderOutcome } from "./order-view";
import { ErrorState, Skeleton } from "./states";
import { ButtonLink, Card, ExternalButton } from "./ui";

/** Success/error pages re-read the order from the server; the URL only names the order. */
export function PaymentOutcome({ orderId, expected }: { orderId: string; expected: "success" | "error" }) {
  const { state, reload } = useApi(`/api/orders/${encodeURIComponent(orderId)}`, orderSchema);
  const order = state.status === "ready" ? state.data : null;
  const actual = order ? orderOutcome(order) : null;

  useEffect(() => {
    if (!order || actual !== "success" || !isPolling(order.status)) return;
    const id = setInterval(() => !document.hidden && reload({ silent: true }), 3000);
    return () => clearInterval(id);
  }, [order, actual, reload]);

  if (state.status === "loading") {
    return (
      <Card role="status">
        <span className="sr-only">Проверяем статус…</span>
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="mt-6 h-4 w-3/4" />
      </Card>
    );
  }
  if (state.status === "error") return <ErrorState error={state.error} onRetry={() => reload()} />;

  const o = state.data;
  const orderLink = `/checkout/${encodeURIComponent(o.id)}`;
  const mismatch = actual !== expected;

  return (
    <Card className={`corner-frame ${actual === "success" ? "border-success/40" : actual === "error" ? "border-accent/50" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <OrderStatusBadge status={o.status} />
        <DemoMarker source={state.source} />
      </div>
      <h2 className="mt-5 font-display text-2xl font-bold">
        {actual === "success"
          ? o.status === "active"
            ? "Подписка активна"
            : "Оплата подтверждена — готовим доступ"
          : actual === "error"
            ? o.status === "awaiting_payment"
              ? "Платёж не прошёл"
              : "Заказ закрыт без оплаты"
            : "Платёж ещё не подтверждён"}
      </h2>
      <p className="mt-3 leading-relaxed text-muted">
        {o.planTitle} · {formatMoney(o.amount)}
      </p>
      {mismatch ? (
        <p className="mt-3 text-sm text-warning">Показан фактический статус с сервера — он отличается от ожидаемого для этой страницы.</p>
      ) : null}
      {actual === "error" && o.status === "awaiting_payment" ? (
        <p className="mt-3 text-sm leading-relaxed text-muted">Деньги не списаны, а заказ остаётся открытым: можно попробовать оплатить снова.</p>
      ) : null}
      {actual === "success" && o.status !== "active" ? (
        <p className="mt-3 text-sm leading-relaxed text-muted">Повторно платить не нужно — доступ выдаётся автоматически, страница обновится сама.</p>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-3">
        {actual === "success" ? <ButtonLink href="/account">В личный кабинет</ButtonLink> : null}
        {actual === "success" ? (
          <ButtonLink href="/connect" variant="secondary">
            Как подключиться
          </ButtonLink>
        ) : null}
        {actual !== "success" && o.status === "awaiting_payment" ? <ButtonLink href={orderLink}>Оплатить снова</ButtonLink> : null}
        {actual === "error" && o.status !== "awaiting_payment" ? <ButtonLink href="/pricing">Выбрать тариф</ButtonLink> : null}
        <ExternalButton href={brand.telegramBot.url} variant="ghost">
          Поддержка в боте
        </ExternalButton>
      </div>
    </Card>
  );
}
