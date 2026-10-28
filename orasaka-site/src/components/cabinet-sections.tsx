import { formatExpiry } from "@/lib/cabinet-copy";
import { dictionary } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/get-locale";
import { fill } from "@/lib/i18n/locale";
import { monthsLabel } from "@/lib/months";
import { formatMoney } from "@/lib/money";
import type { CabinetView } from "@/lib/cabinet-view";
import type { VpnPurchase } from "@/lib/vpn/adapter";
import type { TelegramUi } from "@/lib/telegram-ui";
import { LinkEmailForm, LinkTelegramButton, LogoutButton } from "./cabinet-actions";
import { DeviceList } from "./device-list";
import { SyncButton } from "./sync-button";
import { ButtonLink, Card } from "./ui";

export async function SubscriptionCard({ view }: { view: CabinetView }) {
  const locale = await getLocale();
  const c = dictionary(locale).cabinet;
  const unavailableCopy = view.vpnReason === "unconfigured" ? c.unconfigured : c.unavailable;
  return (
    <Card className="cabinet-card">
      <h2 className="font-mono text-xl font-bold">{c.subsTitle}</h2>
      {view.renewal === "preparing" ? <p className="mt-3">{view.state === "none" ? c.firstPreparing : c.preparing}</p> : null}
      {view.renewal === "failed" ? <p className="mt-3">{c.failed}</p> : null}
      {view.state === "unavailable" ? (
        <p className="mt-3">
          {unavailableCopy}{" "}
          <a className="text-fg underline" href="/account/subscriptions">
            {c.retry}
          </a>
        </p>
      ) : null}
      {view.state === "none" && view.renewal !== "preparing" ? (
        <p className="mt-3">
          {c.none}.{" "}
          <a className="text-fg underline" href="/pricing">
            {c.plans}
          </a>
        </p>
      ) : null}
      {view.state === "expired" || view.state === "active" ? (
        <div className="mt-3 space-y-3 text-sm">
          <p>{view.state === "expired" ? c.expired : c.active}.</p>
          {view.subscriptionId ? <p>{fill(c.id, { id: view.subscriptionId })}</p> : null}
          {view.expiryLabel ? <p>{fill(c.until, { value: view.expiryLabel })}</p> : null}
          {view.remaining ? <p>{fill(c.left, { value: view.remaining })}</p> : null}
          {view.termMonths ? <p>{fill(c.term, { value: monthsLabel(view.termMonths, locale) })}</p> : null}
          {view.connectionUrl ? (
            <label className="block">
              {c.link}
              <input readOnly value={view.connectionUrl} className="mt-2 w-full break-all rounded-md border border-line bg-bg px-3 py-3 font-mono text-xs" />
            </label>
          ) : null}
          {view.connectionUrl ? <p className="text-muted">{c.import}</p> : null}
          <ButtonLink href="/pricing">{c.renew}</ButtonLink>
        </div>
      ) : null}
    </Card>
  );
}

export function visibleBotPurchases(orderIds: readonly string[], purchases: VpnPurchase[] | null) {
  const siteIds = new Set(orderIds);
  return (purchases ?? []).filter((item) => !item.orderId || !siteIds.has(item.orderId));
}

function ordersHref(bot: string | null, site: string | null): string {
  const params = new URLSearchParams();
  if (bot) params.set("cursor", bot);
  if (site) params.set("orders", site);
  const query = params.toString();
  return query ? `/account/orders?${query}` : "/account/orders";
}

export async function OrdersCard({ view }: { view: CabinetView }) {
  const locale = await getLocale();
  const c = dictionary(locale).cabinet;
  const payLabel: Record<string, string> = { pending: c.payPending, succeeded: c.payOk, canceled: c.payCancel };
  const grantLabel: Record<string, string> = { pending: c.grantPending, succeeded: c.grantOk, failed: c.grantFail };
  const bot = visibleBotPurchases(view.orderIds, view.botPurchases);
  return (
    <Card className="cabinet-card">
      <h2 className="font-mono text-xl font-bold">{c.ordersTitle}</h2>
      {view.botBoundary === "unconfigured" ? <p className="mt-3 text-sm text-muted">{c.botPurchases}</p> : null}
      {view.botBoundary === "not_stored" ? <p className="mt-3 text-sm text-muted">{c.notStored}</p> : null}
      {view.botPurchasesError ? <p className="mt-3 text-sm text-muted">{c.botDown}</p> : null}
      {view.orders.length === 0 && bot.length === 0 && !view.botPurchasesError && view.botBoundary !== "unconfigured" && view.botBoundary !== "not_stored" ? (
        <p className="mt-3 text-sm text-muted">{c.empty}</p>
      ) : null}
      <ul className="mt-4 space-y-4">
        {view.orders.map((order) => (
          <li key={order.id} className="border-t border-line pt-4 text-sm">
            <p>{formatExpiry(order.created_at, locale)}</p>
            <p>{monthsLabel(order.term_months, locale)}</p>
            <p>{formatMoney({ amountMinor: order.amount_minor, currency: "RUB" })}</p>
            {order.paid_usdt ? <p>{fill(c.paidUsdt, { value: order.paid_usdt })}</p> : null}
            {order.payment_provider ? (
              <p>
                {fill(c.provider, {
                  value: order.payment_provider === "cryptopay" ? c.providerCrypto : order.payment_provider === "yookassa" ? c.providerYoo : order.payment_provider,
                })}
              </p>
            ) : null}
            <p>{c.sourceSite}</p>
            <p>{fill(c.pay, { value: order.payment_status ? (payLabel[order.payment_status] ?? order.payment_status) : c.payNone })}</p>
            <p>{fill(c.grant, { value: order.fulfillment_status ? (grantLabel[order.fulfillment_status] ?? order.fulfillment_status) : c.grantNone })}</p>
          </li>
        ))}
        {bot.map((item) => (
          <li key={item.id} className="border-t border-line pt-4 text-sm">
            <p>{formatExpiry(item.paidAt, locale)}</p>
            {item.termMonths ? <p>{monthsLabel(item.termMonths, locale)}</p> : null}
            <p>{formatMoney({ amountMinor: item.amountMinor, currency: "RUB" })}</p>
            <p>{c.sourceTg}</p>
            <p>{fill(c.pay, { value: payLabel[item.status] ?? item.status })}</p>
          </li>
        ))}
      </ul>
      {view.purchasePrev || view.purchaseAt ? (
        <a className="mt-4 mr-4 inline-block text-sm text-fg underline" href={ordersHref(view.purchasePrev, view.orderAt)}>
          {c.prevTg}
        </a>
      ) : null}
      {view.purchaseCursor ? (
        <a className="mt-4 mr-4 inline-block text-sm text-fg underline" href={ordersHref(view.purchaseCursor, view.orderAt)}>
          {c.nextTg}
        </a>
      ) : null}
      {view.purchaseAt ? (
        <a className="mt-4 mr-4 inline-block text-sm text-fg underline" href={ordersHref(null, view.orderAt)}>
          {c.firstTg}
        </a>
      ) : null}
      {view.orderPrev || view.orderAt ? (
        <a className="mt-4 mr-4 inline-block text-sm text-fg underline" href={ordersHref(view.purchaseAt, view.orderPrev)}>
          {c.prevSite}
        </a>
      ) : null}
      {view.orderNext ? (
        <a className="mt-4 mr-4 inline-block text-sm text-fg underline" href={ordersHref(view.purchaseAt, view.orderNext)}>
          {c.nextSite}
        </a>
      ) : null}
      {view.orderAt ? (
        <a className="mt-4 inline-block text-sm text-fg underline" href={ordersHref(view.purchaseAt, null)}>
          {c.firstSite}
        </a>
      ) : null}
    </Card>
  );
}

export async function DevicesCard({ view, canRevoke }: { view: CabinetView; canRevoke: boolean }) {
  const c = dictionary(await getLocale()).cabinet;
  return (
    <Card className="cabinet-card">
      <h2 className="font-mono text-xl font-bold">{c.devicesTitle}</h2>
      <DeviceList
        devices={view.devices}
        devicesError={view.devicesError}
        online={view.online}
        deviceLimit={view.deviceLimit}
        canRevoke={canRevoke}
      />
    </Card>
  );
}

export async function SettingsCard({ view, telegram, devMailbox }: { view: CabinetView; telegram: TelegramUi; devMailbox: boolean }) {
  const c = dictionary(await getLocale()).cabinet;
  return (
    <Card className="cabinet-card">
      <h2 className="font-mono text-xl font-bold">{c.settingsTitle}</h2>
      <p className="mt-3 text-sm text-muted">{c.settingsLead}</p>
      <p className="mt-3 text-sm text-muted">{view.email ? fill(c.emailSet, { value: view.email }) : c.emailNone}</p>
      <p className="mt-1 text-sm text-muted">{view.telegramLinked ? c.tgOn : c.tgOff}</p>
      {view.email ? null : <LinkEmailForm devMailbox={devMailbox} />}
      {view.telegramLinked ? null : <LinkTelegramButton mode={telegram} />}
      <div className="mt-5 flex flex-wrap gap-3">
        <SyncButton />
        <LogoutButton />
      </div>
    </Card>
  );
}
