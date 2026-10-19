"use client";

import Link from "next/link";
import { useState } from "react";
import { z } from "zod";
import { brand } from "@/config/brand";
import { DEMO_PRESETS, type DemoPreset } from "@/lib/api/client";
import {
  API_ERROR_MESSAGE,
  connectionSchema,
  devicesResponseSchema,
  ordersResponseSchema,
  sessionSchema,
  subscriptionSchema,
  type DataSource,
  type DevicesResponse,
} from "@/lib/api/types";
import { fetchJson, postJson } from "@/lib/fetch-json";
import { formatMoney } from "@/lib/money";
import { useApi } from "@/lib/use-api";
import { ConfirmDialog } from "./confirm-dialog";
import { DemoMarker } from "./demo-marker";
import { formatDate, OrderStatusBadge } from "./order-status-badge";
import { EmptyState, ErrorState, Skeleton } from "./states";
import { Badge, Button, ButtonLink, Card, ExternalButton } from "./ui";

const okSchema = z.object({ ok: z.literal(true) });

function maskUrl(url: string) {
  return url.length <= 20 ? "••••••••" : `${url.slice(0, 14)}••••••••${url.slice(-4)}`;
}

function CardTitle({ children, source }: { children: React.ReactNode; source?: DataSource }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted">{children}</h2>
      {source ? <DemoMarker source={source} label="DEMO" /> : null}
    </div>
  );
}

function CardSkeleton() {
  return (
    <>
      <Skeleton className="mt-5 h-8 w-1/2" />
      <Skeleton className="mt-4 h-4 w-3/4" />
    </>
  );
}

export function AccountView() {
  const session = useApi("/api/auth/session", sessionSchema);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  async function run(path: string, body: unknown = {}) {
    setBusy(true);
    setError(null);
    const res = await postJson(path, okSchema, body);
    setBusy(false);
    if (!res.ok) {
      setError(API_ERROR_MESSAGE[res.error]);
      return false;
    }
    return true;
  }

  if (session.state.status === "loading") {
    return (
      <Card role="status" aria-live="polite">
        <span className="sr-only">Проверяем вход…</span>
        <Skeleton className="h-5 w-1/3" />
        <CardSkeleton />
      </Card>
    );
  }
  if (session.state.status === "error") return <ErrorState error={session.state.error} onRetry={() => session.reload()} />;

  const { authenticated, user, demoLoginAvailable } = session.state.data;

  if (!authenticated || !user) {
    return (
      <EmptyState title="Вход не выполнен">
        <p>
          Вход через Telegram появится после согласования авторизации с сервером бота. Сейчас кабинет доступен в
          Telegram{demoLoginAvailable ? ", а на сайте можно открыть демо-кабинет с тестовыми данными" : ""}.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {demoLoginAvailable ? (
            <Button
              disabled={busy}
              onClick={async () => {
                if (await run("/api/auth/demo-login")) session.reload();
              }}
            >
              {busy ? "Входим…" : "Войти в демо-кабинет"}
            </Button>
          ) : null}
          <ExternalButton href={brand.telegramBot.url} variant={demoLoginAvailable ? "secondary" : "primary"}>
            Открыть кабинет в боте
          </ExternalButton>
        </div>
        {demoLoginAvailable ? (
          <p className="mt-4 font-mono text-xs text-warning">⚠ DEMO: это не вход через Telegram, а временный тестовый пользователь.</p>
        ) : null}
        <p role="alert" className="mt-3 text-sm text-accent">
          {error}
        </p>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-warning/40 bg-warning/5 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="font-semibold">{user.displayName}</p>
          <p className="mt-1 text-sm text-warning">
            <span aria-hidden="true">⚠ </span>
            {session.state.source === "mock"
              ? "Демо: тестовые данные, не связаны с реальными подписками."
              : "Данные с сервера подписок."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {session.state.source === "mock" ? (
            <label className="flex items-center gap-3 text-sm">
              <span className="text-muted">Сценарий</span>
              <select
                defaultValue=""
                disabled={busy}
                onChange={async (e) => {
                  const preset = e.target.value as DemoPreset;
                  e.target.value = "";
                  if (await run("/api/demo/preset", { preset })) setVersion((v) => v + 1);
                }}
                className="min-h-11 rounded-md border border-line bg-surface px-3 text-fg"
              >
                <option value="" disabled>
                  Выбрать…
                </option>
                {DEMO_PRESETS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              if (await run("/api/auth/logout")) session.reload();
            }}
          >
            Выйти
          </Button>
        </div>
      </div>
      <p role="alert" className="text-sm text-accent empty:hidden">
        {error}
      </p>
      <AccountDetails key={version} />
    </div>
  );
}

function AccountDetails() {
  const sub = useApi("/api/subscription", subscriptionSchema);
  const orders = useApi("/api/orders", ordersResponseSchema);
  const active = sub.state.status === "ready" && sub.state.data.status === "active";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardTitle source={sub.state.status === "ready" ? sub.state.source : undefined}>Подписка</CardTitle>
        {sub.state.status === "loading" ? (
          <CardSkeleton />
        ) : sub.state.status === "error" ? (
          <ErrorState error={sub.state.error} onRetry={() => sub.reload()} />
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {sub.state.data.status === "active" ? (
                <Badge tone="success">Активна</Badge>
              ) : sub.state.data.status === "expired" ? (
                <Badge tone="danger">Истекла</Badge>
              ) : (
                <Badge>Нет подписки</Badge>
              )}
              {sub.state.data.provisioning === "pending" ? <Badge tone="pending">Доступ готовится</Badge> : null}
              {sub.state.data.provisioning === "failed" ? <Badge tone="danger">Ошибка выдачи</Badge> : null}
            </div>
            <p className="mt-4 text-lg font-semibold">
              {sub.state.data.expiresAt ? `До ${formatDate(sub.state.data.expiresAt)}` : "Срок не установлен"}
            </p>
            {sub.state.data.planTitle ? <p className="mt-1 text-sm text-muted">{sub.state.data.planTitle}</p> : null}
            {sub.state.data.provisioning === "pending" ? (
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Оплата подтверждена. Сервер повторяет выдачу автоматически — платить повторно не нужно.
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-3">
              {sub.state.data.status === "none" ? (
                <ButtonLink href="/pricing">Выбрать тариф</ButtonLink>
              ) : (
                <ButtonLink href="/checkout?renew=1">Продлить</ButtonLink>
              )}
            </div>
          </>
        )}
      </Card>

      <DevicesCard />

      {active ? <ConnectionCard /> : null}

      <Card className="md:col-span-2">
        <CardTitle source={orders.state.status === "ready" ? orders.state.source : undefined}>История покупок</CardTitle>
        {orders.state.status === "loading" ? (
          <CardSkeleton />
        ) : orders.state.status === "error" ? (
          <ErrorState error={orders.state.error} onRetry={() => orders.reload()} />
        ) : orders.state.data.orders.length ? (
          <ul className="mt-4 divide-y divide-line">
            {orders.state.data.orders.map((o) => (
              <li key={o.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link
                    href={`/checkout/${encodeURIComponent(o.id)}`}
                    className="font-semibold underline-offset-4 hover:text-accent hover:underline"
                  >
                    {o.kind === "renewal" ? "Продление · " : ""}
                    {o.planTitle} · {formatMoney(o.amount)}
                  </Link>
                  <p className="text-sm text-muted">
                    {formatDate(o.createdAt)}
                    <span className="ml-2 font-mono text-xs normal-case">{o.id}</span>
                  </p>
                </div>
                <OrderStatusBadge status={o.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">Покупок пока нет.</p>
        )}
      </Card>
    </div>
  );
}

function DevicesCard() {
  const { state, setState, reload } = useApi("/api/devices", devicesResponseSchema);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function remove(id: string) {
    setMessage(null);
    const res = await fetchJson(`/api/devices/${encodeURIComponent(id)}`, devicesResponseSchema, { method: "DELETE" });
    if (res.ok) {
      setState({ status: "ready", data: res.data as DevicesResponse, source: res.source });
      setMessage("Устройство отключено.");
    } else setMessage(API_ERROR_MESSAGE[res.error]);
  }

  return (
    <Card>
      <CardTitle source={state.status === "ready" ? state.source : undefined}>
        Устройства{state.status === "ready" ? ` · ${state.data.items.length} из ${state.data.limit}` : ""}
      </CardTitle>
      {state.status === "loading" ? (
        <CardSkeleton />
      ) : state.status === "error" ? (
        <ErrorState error={state.error} onRetry={() => reload()} />
      ) : state.data.items.length ? (
        <ul className="mt-4 space-y-2">
          {state.data.items.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate">{d.name}</span>
                <span className="text-xs text-muted">{formatDate(d.lastSeenAt)}</span>
              </span>
              <Button variant="ghost" className="shrink-0 px-3" onClick={() => setRemoving({ id: d.id, name: d.name })}>
                Отключить
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">Устройства ещё не подключались.</p>
      )}
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-muted">
        {message}
      </p>
      <ConfirmDialog
        open={removing !== null}
        title="Отключить устройство?"
        description={`«${removing?.name ?? ""}» потеряет доступ. Подключить его снова можно по ссылке подписки.`}
        confirmLabel="Отключить"
        onConfirm={() => removing && remove(removing.id)}
        onClose={() => setRemoving(null)}
      />
    </Card>
  );
}

function ConnectionCard() {
  const { state, reload } = useApi("/api/subscription/connection", connectionSchema);
  const [revealed, setRevealed] = useState(false);
  const [message, setMessage] = useState("");

  if (state.status === "loading") {
    return (
      <Card className="md:col-span-2">
        <CardTitle>Ссылка подключения</CardTitle>
        <CardSkeleton />
      </Card>
    );
  }
  if (state.status === "error") {
    return (
      <Card className="md:col-span-2">
        <CardTitle>Ссылка подключения</CardTitle>
        {state.error === "not_found" ? (
          <p className="mt-4 text-sm text-muted">Ссылка появится, как только доступ будет выдан.</p>
        ) : (
          <ErrorState error={state.error} onRetry={() => reload()} />
        )}
      </Card>
    );
  }

  const url = state.data.url;
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
      <CardTitle source={state.source}>Ссылка подключения</CardTitle>
      <p className="mt-4 break-all rounded-md border border-line bg-bg px-4 py-3 font-mono text-sm">
        {revealed ? url : maskUrl(url)}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={copy}>Скопировать ссылку</Button>
        <Button variant="secondary" aria-pressed={revealed} onClick={() => setRevealed((v) => !v)}>
          {revealed ? "Скрыть" : "Показать"}
        </Button>
        <ButtonLink href="/connect" variant="ghost">
          Как подключиться
        </ButtonLink>
      </div>
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-success">
        {message}
      </p>
      <p className="text-xs text-muted">
        {state.data.test
          ? "Тестовая ссылка на example.invalid — к VPN не подключает."
          : "Не передавайте ссылку другим людям — она открывает доступ к вашей подписке."}
      </p>
    </Card>
  );
}
