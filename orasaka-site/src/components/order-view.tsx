"use client";

import { useEffect, useState } from "react";
import { brand } from "@/config/brand";
import { API_ERROR_MESSAGE, orderSchema } from "@/lib/api/types";
import { fetchJson } from "@/lib/fetch-json";
import { formatMoney } from "@/lib/money";
import { isPolling, ORDER_STATUS_META } from "@/lib/order-status";
import { useApi } from "@/lib/use-api";
import { ConfirmDialog } from "./confirm-dialog";
import { formatDate, OrderStatusBadge } from "./order-status-badge";
import { EmptyState, ErrorState, Skeleton } from "./states";
import { Badge, Button, ButtonLink, Card, ExternalButton } from "./ui";

const POLL_MS = 3000;

export function OrderView({ orderId, mode }: { orderId: string; mode: "checkout" | "return" }) {
  const path = `/api/orders/${encodeURIComponent(orderId)}`;
  const { state, setState, reload } = useApi(path, orderSchema);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const status = state.status === "ready" ? state.data.status : null;

  useEffect(() => {
    if (!status || !isPolling(status)) return;
    const id = setInterval(() => {
      if (!document.hidden) reload({ silent: true });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [status, reload]);

  async function act(action: "cancel" | "mock_pay") {
    setBusy(true);
    setActionError(null);
    const res = await fetchJson(path, orderSchema, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    if (res.ok) setState({ status: "ready", data: res.data });
    else setActionError(API_ERROR_MESSAGE[res.error]);
  }

  if (state.status === "loading") {
    return (
      <Card role="status" aria-live="polite">
        <span className="sr-only">Загружаем заказ…</span>
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="mt-6 h-10 w-1/2" />
        <Skeleton className="mt-6 h-4 w-3/4" />
      </Card>
    );
  }

  if (state.status === "error") {
    if (state.error === "not_found") {
      return (
        <EmptyState title="Заказ не найден">
          <p>Заказа с таким номером нет или он принадлежит другому аккаунту.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/pricing">К тарифам</ButtonLink>
            <ExternalButton href={brand.telegramBot.url} variant="secondary">
              Открыть бота
            </ExternalButton>
          </div>
        </EmptyState>
      );
    }
    return <ErrorState error={state.error} onRetry={() => reload()} />;
  }

  const order = state.data;
  const meta = ORDER_STATUS_META[order.status];

  return (
    <Card className="corner-frame">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Заказ {order.id}</p>
        {order.test ? <Badge tone="test">TEST</Badge> : null}
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-sm text-muted">Тариф</p>
          <p className="mt-1 font-display text-xl font-semibold">{order.planTitle}</p>
        </div>
        <div>
          <p className="text-sm text-muted">Сумма, зафиксированная в заказе</p>
          <p className="mt-1 font-display text-xl font-semibold">{formatMoney(order.amount)}</p>
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true" className="mt-8 rounded-lg border border-line bg-bg p-5">
        <OrderStatusBadge status={order.status} />
        <p className="mt-3 leading-relaxed text-muted">{meta.description}</p>
        {mode === "return" && order.status === "awaiting_payment" ? (
          <p className="mt-2 text-sm text-muted">
            Возврат со страницы оплаты не подтверждает платёж. Статус обновится после подтверждения платёжным сервисом.
          </p>
        ) : null}
        {isPolling(order.status) ? (
          <p className="mt-2 font-mono text-xs text-muted">Проверяем статус автоматически каждые {POLL_MS / 1000} с.</p>
        ) : null}
        {order.expiresAt && order.status === "awaiting_payment" ? (
          <p className="mt-2 text-sm text-muted">Оплатить до {formatDate(order.expiresAt)}</p>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {order.status === "awaiting_payment" ? (
          <>
            {order.test ? (
              <Button onClick={() => act("mock_pay")} disabled={busy}>
                Имитировать оплату (тест)
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setConfirmCancel(true)} disabled={busy}>
              Отменить заказ
            </Button>
          </>
        ) : null}
        {order.status === "active" ? <ButtonLink href="/account">Перейти в кабинет</ButtonLink> : null}
        {meta.final && order.status !== "active" ? <ButtonLink href="/pricing">Выбрать тариф заново</ButtonLink> : null}
        <Button variant="ghost" onClick={() => reload({ silent: true })}>
          Проверить снова
        </Button>
      </div>

      {order.test ? (
        <p className="mt-4 text-xs text-muted">
          Тестовый заказ: вместо страницы платёжного сервиса используется имитация. Реальные деньги не списываются.
        </p>
      ) : null}
      <p role="alert" className="mt-3 text-sm text-accent">
        {actionError}
      </p>

      <ConfirmDialog
        open={confirmCancel}
        title="Отменить заказ?"
        description="Заказ будет отменён, подписка по нему не выдаётся. Создать новый заказ можно в любой момент."
        confirmLabel="Отменить заказ"
        onConfirm={() => act("cancel")}
        onClose={() => setConfirmCancel(false)}
      />
    </Card>
  );
}
