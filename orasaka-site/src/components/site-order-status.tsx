import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { formatMoney } from "@/lib/money";
import { monthsLabel } from "@/lib/months";
import { dictionary } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/get-locale";
import { fill } from "@/lib/i18n/locale";
import { readCryptoConfig } from "@/lib/payments/cryptopay-api";
import { reconcileCryptoOrder } from "@/lib/payments/cryptopay-flow";
import { cryptoChargeReady, cryptoStandNote, paymentsReady } from "@/lib/payments/ready";
import { readYooConfig } from "@/lib/payments/yookassa-api";
import { SESSION_COOKIE } from "@/lib/server/bff";
import { reconcileOrder, runFulfillment } from "@/lib/server/billing";
import { getStore } from "@/lib/server/db";
import { ownedOrder, readSession, requestNow } from "@/lib/server/store";
import { currentAdapter } from "@/lib/vpn/http-adapter";
import { Card } from "./ui";

export async function SiteOrderStatus({ orderId, returned = false }: { orderId: string; returned?: boolean }) {
  await connection();
  const store = getStore();
  const now = requestNow();
  const account = readSession(store, (await cookies()).get(SESSION_COOKIE)?.value ?? "", now);
  if (!account) redirect(`/login?next=${encodeURIComponent(returned ? `/payment/return?orderId=${orderId}` : `/checkout/${orderId}`)}`);
  const locale = await getLocale();
  const copy = dictionary(locale).checkout;
  const config = readYooConfig();
  const crypto = readCryptoConfig();
  if (crypto && cryptoChargeReady()) await reconcileCryptoOrder(store, crypto, orderId, account.id, now);
  if (returned && config && paymentsReady()) await reconcileOrder(store, config, orderId, account.id, now);
  if ((crypto && cryptoChargeReady()) || (returned && config && paymentsReady())) {
    await runFulfillment(store, currentAdapter(), now);
  }
  const order = ownedOrder(store, account.id, orderId);
  if (!order) return <p>{copy.missing}</p>;
  const labels = dictionary(locale).status;
  const label =
    order.status === "paid" ? copy.received
    : order.status === "active" ? dictionary(locale).outcome.active
    : order.status === "canceled" ? labels.cancelled
    : order.status === "awaiting_payment" ? labels.awaiting_payment
    : order.status === "failed" ? labels.failed
    : order.status;
  return (
    <Card>
      {returned ? <p>{copy.statusLead}</p> : null}
      {cryptoStandNote() ? <p className="mt-2 text-sm text-muted">{copy.stand}</p> : null}
      <p className="mt-3 text-sm">{monthsLabel(order.term_months, locale)}</p>
      <p className="mt-1 text-sm">{formatMoney({ amountMinor: order.amount_minor, currency: "RUB" })}</p>
      {order.paid_usdt ? <p className="mt-1 text-sm">{fill(dictionary(locale).cabinet.paidUsdt, { value: order.paid_usdt })}</p> : null}
      {order.payment_provider ? (
        <p className="mt-1 text-sm">
          {order.payment_provider === "cryptopay" ? dictionary(locale).cabinet.providerCrypto : order.payment_provider === "yookassa" ? dictionary(locale).cabinet.providerYoo : order.payment_provider}
        </p>
      ) : null}
      <p className="mt-1 text-sm">{label}</p>
      <a className="mt-4 inline-block text-sm text-fg underline" href="/account/subscriptions">
        {dictionary(locale).cabinet.subs}
      </a>
    </Card>
  );
}
