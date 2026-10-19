"use client";

import Link from "next/link";
import { useState } from "react";
import { brand } from "@/config/brand";
import { DEMO_SCENARIOS, type DemoScenario } from "@/lib/api/client";
import { accountSchema, type Account } from "@/lib/api/types";
import { useApi } from "@/lib/use-api";
import { formatMoney } from "@/lib/money";
import { formatDate, OrderStatusBadge } from "./order-status-badge";
import { EmptyState, ErrorState, Skeleton } from "./states";
import { Badge, Button, Card, ExternalButton } from "./ui";

function maskUrl(url: string) {
  return url.length <= 20 ? "••••••••" : `${url.slice(0, 14)}••••••••${url.slice(-4)}`;
}

export function AccountView({ demo }: { demo: boolean }) {
  const [scenario, setScenario] = useState<DemoScenario>("active");
  const path = demo ? `/api/me?scenario=${scenario}` : "/api/me";
  const { state, reload } = useApi(path, accountSchema);

  return (
    <div className="space-y-8">
      {demo ? (
        <div className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-warning">
            <span aria-hidden="true">⚠ </span>Демо: тестовые данные, не связаны с реальными подписками.
          </p>
          <label className="flex items-center gap-3 text-sm">
            <span className="text-muted">Сценарий</span>
            <select
              value={scenario}
              onChange={(e) => {
                setScenario(e.target.value as DemoScenario);
                reload();
              }}
              className="min-h-11 rounded-md border border-line bg-surface px-3 text-fg"
            >
              {DEMO_SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {state.status === "loading" ? (
        <div role="status" aria-live="polite" className="grid gap-4 md:grid-cols-2">
          <span className="sr-only">Загружаем данные кабинета…</span>
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="mt-5 h-8 w-1/2" />
              <Skeleton className="mt-4 h-4 w-3/4" />
            </Card>
          ))}
        </div>
      ) : state.status === "error" ? (
        state.error === "unauthorized" ? (
          <EmptyState title="Вход не выполнен">
            <p>Вход на сайте появится после согласования авторизации с сервером бота. Сейчас кабинет доступен в Telegram.</p>
            <div className="mt-5 flex justify-center">
              <ExternalButton href={brand.telegramBot.url}>Открыть кабинет в боте</ExternalButton>
            </div>
          </EmptyState>
        ) : (
          <ErrorState error={state.error} onRetry={() => reload()} />
        )
      ) : (
        <AccountDetails account={state.data} />
      )}
    </div>
  );
}

function AccountDetails({ account }: { account: Account }) {
  const { subscription, provisioning, connection, devices, orders } = account;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Подписка</h2>
        <div className="mt-4">
          {subscription.status === "active" ? (
            <Badge tone="success">Активна</Badge>
          ) : subscription.status === "expired" ? (
            <Badge tone="danger">Истекла</Badge>
          ) : (
            <Badge>Нет подписки</Badge>
          )}
        </div>
        <p className="mt-4 text-lg font-semibold">
          {subscription.expiresAt ? `До ${formatDate(subscription.expiresAt)}` : "Срок не установлен"}
        </p>
        {subscription.status !== "active" ? (
          <Link href="/pricing" className="mt-3 inline-flex min-h-11 items-center text-sm text-accent underline-offset-4 hover:underline">
            Посмотреть тарифы
          </Link>
        ) : null}
      </Card>

      <Card>
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Выдача доступа</h2>
        <div className="mt-4">
          {provisioning === "ready" ? (
            <Badge tone="success">Доступ активен</Badge>
          ) : provisioning === "pending" ? (
            <Badge tone="pending">Оплачен, доступ готовится</Badge>
          ) : provisioning === "failed" ? (
            <Badge tone="danger">Ошибка выдачи</Badge>
          ) : (
            <Badge>Не выдавался</Badge>
          )}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          {provisioning === "pending"
            ? "Оплата подтверждена. Сервер повторяет выдачу автоматически — платить повторно не нужно."
            : provisioning === "ready"
              ? "Ключ подключения выдан и доступен ниже."
              : "После оплаты заказа доступ выдаётся автоматически."}
        </p>
      </Card>

      {connection ? <ConnectionCard url={connection.url} /> : null}

      {devices ? (
        <Card>
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
            Устройства · {devices.items.length} из {devices.limit}
          </h2>
          {devices.items.length ? (
            <ul className="mt-4 space-y-2">
              {devices.items.map((d) => (
                <li key={d.id} className="flex justify-between gap-3 text-sm">
                  <span>{d.name}</span>
                  <span className="text-muted">{formatDate(d.lastSeenAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted">Устройства ещё не подключались.</p>
          )}
        </Card>
      ) : null}

      <Card className="md:col-span-2">
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted">История заказов</h2>
        {orders.length ? (
          <ul className="mt-4 divide-y divide-line">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">
                    {o.planTitle} · {formatMoney(o.amount)}
                  </p>
                  <p className="text-sm text-muted">{formatDate(o.createdAt)}</p>
                </div>
                <OrderStatusBadge status={o.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">Заказов пока нет.</p>
        )}
      </Card>
    </div>
  );
}

function ConnectionCard({ url }: { url: string }) {
  const [revealed, setRevealed] = useState(false);
  const [message, setMessage] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Ссылка скопирована в буфер обмена.");
    } catch {
      setMessage("Не удалось скопировать автоматически. Нажмите «Показать» и скопируйте вручную.");
    }
  }

  return (
    <Card className="md:col-span-2">
      <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Ссылка подключения</h2>
      <p className="mt-4 break-all rounded-md border border-line bg-bg px-4 py-3 font-mono text-sm">
        {revealed ? url : maskUrl(url)}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={copy}>Скопировать ссылку</Button>
        <Button variant="secondary" aria-pressed={revealed} onClick={() => setRevealed((v) => !v)}>
          {revealed ? "Скрыть" : "Показать"}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-success">
        {message}
      </p>
      <p className="text-xs text-muted">Не передавайте ссылку другим людям — она открывает доступ к вашей подписке.</p>
    </Card>
  );
}
