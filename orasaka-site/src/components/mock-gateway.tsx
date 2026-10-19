"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { API_ERROR_MESSAGE, mockGatewayPaymentSchema } from "@/lib/api/types";
import { postJson } from "@/lib/fetch-json";
import { formatMoney } from "@/lib/money";
import { useApi } from "@/lib/use-api";
import { EmptyState, ErrorState, Skeleton } from "./states";
import { Badge, Button, ButtonLink, Card } from "./ui";

const resultSchema = z.object({ returnUrl: z.string() });

/** MOCK hosted payment page. Stands in for the provider's checkout; never shown in live mode. */
export function MockGateway({ paymentId }: { paymentId: string }) {
  const path = `/api/pay/mock/${encodeURIComponent(paymentId)}`;
  const { state, reload } = useApi(path, mockGatewayPaymentSchema);
  const [busy, setBusy] = useState<"succeeded" | "canceled" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function complete(outcome: "succeeded" | "canceled") {
    setBusy(outcome);
    setError(null);
    const res = await postJson(path, resultSchema, { outcome });
    if (!res.ok) {
      setBusy(null);
      setError(API_ERROR_MESSAGE[res.error]);
      return;
    }
    router.push(res.data.returnUrl);
  }

  if (state.status === "loading") {
    return (
      <Card role="status">
        <span className="sr-only">Загружаем платёж…</span>
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="mt-6 h-12 w-1/3" />
      </Card>
    );
  }
  if (state.status === "error") {
    if (state.error === "not_found") {
      return (
        <EmptyState title="Тестовый платёж не найден">
          <p>Демо-шлюз хранит платежи только в памяти сервера. Создайте заказ заново.</p>
          <div className="mt-5 flex justify-center">
            <ButtonLink href="/pricing">К тарифам</ButtonLink>
          </div>
        </EmptyState>
      );
    }
    return <ErrorState error={state.error} onRetry={() => reload()} />;
  }

  const p = state.data;
  return (
    <Card className="corner-frame border-warning/50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-warning">⚠ DEMO · тестовый платёжный шлюз</p>
        <Badge tone="test">TEST</Badge>
      </div>
      <p className="mt-6 text-sm text-muted">Сумма к оплате</p>
      <p className="mt-1 font-display text-4xl font-bold">{formatMoney(p.amount)}</p>
      <p className="mt-3 break-all font-mono text-xs text-muted">
        Платёж {p.providerPaymentId} · заказ {p.orderId}
      </p>
      <p className="mt-6 text-sm leading-relaxed text-muted">
        Эта страница имитирует сторонний платёжный сервис. Карта не запрашивается, деньги не списываются. После выбора
        результата шлюз отправит подписанное уведомление на сервер, а сайт отдельно перепроверит статус платежа.
      </p>
      {p.status === "pending" ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => complete("succeeded")} disabled={busy !== null} aria-busy={busy === "succeeded"}>
            {busy === "succeeded" ? "Подтверждаем…" : "Оплатить (тест)"}
          </Button>
          <Button variant="secondary" onClick={() => complete("canceled")} disabled={busy !== null}>
            Отменить платёж
          </Button>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Badge tone={p.status === "succeeded" ? "success" : "danger"}>
            {p.status === "succeeded" ? "Платёж проведён" : "Платёж отменён"}
          </Badge>
          <ButtonLink href={p.returnUrl}>Вернуться на сайт</ButtonLink>
        </div>
      )}
      <p role="alert" className="mt-3 text-sm text-accent empty:hidden">
        {error}
      </p>
    </Card>
  );
}
