"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { brand } from "@/config/brand";
import { API_ERROR_MESSAGE, checkoutResponseSchema, orderSchema, type Order } from "@/lib/api/types";
import { fetchJson, postJson } from "@/lib/fetch-json";
import { formatMoney } from "@/lib/money";
import { isPolling, ORDER_STATUS_META } from "@/lib/order-status";
import { useApi } from "@/lib/use-api";
import { ConfirmDialog } from "./confirm-dialog";
import { DemoMarker } from "./demo-marker";
import { formatDate, OrderStatusBadge } from "./order-status-badge";
import { EmptyState, ErrorState, Skeleton } from "./states";
import { Badge, Button, ButtonLink, Card, ExternalButton } from "./ui";

const POLL_MS = 3000;

const PAYMENT_STATUS_LABEL: Record<NonNullable<Order["paymentStatus"]>, string> = {
  pending: "ожидает оплаты",
  succeeded: "подтверждён платёжным сервисом",
  canceled: "отменён",
  failed: "не прошёл",
  expired: "истёк",
};

export type OrderOutcome = "success" | "error" | "pending";

/** Derived only from server data: a URL parameter never decides the outcome. */
export function orderOutcome(order: Order): OrderOutcome {
  if (["paid", "provisioning_pending", "active"].includes(order.status)) return "success";
  if (["failed", "expired", "cancelled"].includes(order.status)) return "error";
  if (order.paymentStatus && ["canceled", "failed", "expired"].includes(order.paymentStatus)) return "error";
  return "pending";
}

export function OrderView({ orderId, mode }: { orderId: string; mode: "checkout" | "return" }) {
  const path = `/api/orders/${encodeURIComponent(orderId)}`;
  const { state, setState, reload } = useApi(path, orderSchema);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const router = useRouter();
  const verified = useRef(false);

  const order = state.status === "ready" ? state.data : null;
  const outcome = order ? orderOutcome(order) : null;

  useEffect(() => {
    if (!order || !isPolling(order.status)) return;
    if (mode === "return" && outcome === "error") return;
    const id = setInterval(() => {
      if (!document.hidden) reload({ silent: true });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [order, outcome, mode, reload]);

  // Re-runs every time the route becomes visible: cacheComponents can restore this page from a hidden
  // Activity with a previous visit's state, so redirects stay disarmed until a fresh server verify.
  useEffect(() => {
    if (mode !== "return") return;
    verified.current = false;
    let live = true;
    postJson(path, orderSchema, { action: "verify" }).then((res) => {
      if (!live) return;
      verified.current = true;
      if (res.ok) setState({ status: "ready", data: res.data, source: res.source });
      else reload({ silent: true });
    });
    return () => {
      live = false;
    };
  }, [mode, path, setState, reload]);

  useEffect(() => {
    if (mode !== "return" || !verified.current || !outcome || outcome === "pending") return;
    router.replace(`/payment/${outcome}?orderId=${encodeURIComponent(orderId)}`);
  }, [mode, order, outcome, orderId, router]);

  async function act(action: "cancel" | "pay" | "verify") {
    setBusy(true);
    setActionError(null);
    if (action === "pay") {
      const res = await postJson(path, checkoutResponseSchema, { action });
      setBusy(false);
      if (!res.ok) return setActionError(API_ERROR_MESSAGE[res.error]);
      if (res.data.checkoutUrl) return router.push(res.data.checkoutUrl);
      setState({ status: "ready", data: res.data.order, source: res.source });
      return;
    }
    const res = await fetchJson(path, orderSchema, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    if (res.ok) setState({ status: "ready", data: res.data, source: res.source });
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
    if (state.error === "not_found" || state.error === "unauthorized") {
      return (
        <EmptyState title="Заказ не найден">
          <p>Заказа с таким номером нет, он принадлежит другому аккаунту или демо-сессия истекла.</p>
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

  const o = state.data;
  const meta = ORDER_STATUS_META[o.status];

  return (
    <Card className="corner-frame">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          {o.kind === "renewal" ? "Продление" : "Заказ"} <span className="normal-case tracking-normal">{o.id}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <DemoMarker source={state.source} />
          {o.test ? <Badge tone="test">TEST</Badge> : null}
        </div>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-3">
        <div>
          <p className="text-sm text-muted">Тариф</p>
          <p className="mt-1 font-display text-xl font-semibold">{o.planTitle}</p>
        </div>
        <div>
          <p className="text-sm text-muted">Сумма в заказе</p>
          <p className="mt-1 font-display text-xl font-semibold">{formatMoney(o.amount)}</p>
        </div>
        <div>
          <p className="text-sm text-muted">Способ оплаты</p>
          <p className="mt-1 font-semibold">{o.paymentMethod === "mock" ? "Тестовая оплата (DEMO)" : (o.paymentMethod ?? "—")}</p>
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true" className="mt-8 rounded-lg border border-line bg-bg p-5">
        <OrderStatusBadge status={o.status} />
        <p className="mt-3 leading-relaxed text-muted">{meta.description}</p>
        {o.paymentStatus ? (
          <p className="mt-2 text-sm text-muted">Последний платёж: {PAYMENT_STATUS_LABEL[o.paymentStatus]}.</p>
        ) : null}
        {mode === "return" && outcome === "pending" ? (
          <p className="mt-2 text-sm text-muted">
            Возврат со страницы оплаты не подтверждает платёж. Ждём подтверждения от платёжного сервиса.
          </p>
        ) : null}
        {isPolling(o.status) ? (
          <p className="mt-2 font-mono text-xs text-muted">Проверяем статус автоматически каждые {POLL_MS / 1000} с.</p>
        ) : null}
        {o.expiresAt && o.status === "awaiting_payment" ? (
          <p className="mt-2 text-sm text-muted">Оплатить до {formatDate(o.expiresAt)}</p>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {o.status === "awaiting_payment" ? (
          <>
            <Button onClick={() => act("pay")} disabled={busy} aria-busy={busy}>
              {o.paymentStatus === "pending" ? "Перейти к оплате" : "Оплатить снова"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmCancel(true)} disabled={busy}>
              Отменить заказ
            </Button>
          </>
        ) : null}
        {o.status === "active" ? <ButtonLink href="/account">Перейти в кабинет</ButtonLink> : null}
        {meta.final && o.status !== "active" ? <ButtonLink href="/pricing">Выбрать тариф заново</ButtonLink> : null}
        <Button variant="ghost" onClick={() => act("verify")} disabled={busy}>
          Проверить статус
        </Button>
      </div>

      {o.test ? (
        <p className="mt-4 text-xs text-muted">
          Тестовый заказ: вместо страницы платёжного сервиса используется DEMO-шлюз. Реальные деньги не списываются.
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
