import { randomUUID } from "node:crypto";
import { CATALOG_VERSION, quotePlan } from "../catalog";
import { yooCreatePayment, yooGetPayment, YooTimeoutError, type YooConfig, type YooPayment } from "../payments/yookassa-api";
import { yookassaNotificationPaymentId, yookassaValue } from "../payments/yookassa-redirect";
import type { VpnAdapter } from "../vpn/adapter";
import {
  attachPayment,
  bumpFulfillment,
  cancelOrder,
  createOrder,
  dueFulfillments,
  failFulfillment,
  finishFulfillment,
  accountById,
  fulfillmentOf,
  insertPendingPayment,
  markOrderPaid,
  orderById,
  paymentByOrder,
  repairBilling,
  type OrderRow,
  type Store,
} from "./store";

export function returnUrlFor(origin: string, orderId: string): string {
  return `${origin}/payment/return?orderId=${encodeURIComponent(orderId)}`;
}

export function placeOrder(
  store: Store,
  input: { accountId: string; planId: string; kind: "new" | "renewal"; idempotencyKey: string; now: number },
): OrderRow | { error: "unknown_plan" | "bad_key" | "conflict" } {
  const plan = quotePlan(input.planId);
  if (!plan) return { error: "unknown_plan" };
  return createOrder(store, {
    accountId: input.accountId,
    catalogVersion: CATALOG_VERSION,
    planId: plan.id,
    termMonths: plan.months,
    amountMinor: plan.amountMinor,
    kind: input.kind,
    idempotencyKey: input.idempotencyKey,
    now: input.now,
  });
}

type FetchOpts = { fetchImpl?: typeof fetch; timeoutMs?: number };

export async function startPayment(
  store: Store,
  input: { accountId: string; orderId: string; origin: string; config: YooConfig | null; now: number; opts?: FetchOpts },
): Promise<
  | { ok: true; idempotencyKey: string; checkoutUrl: string | null; timedOut?: false }
  | { ok: true; idempotencyKey: string; timedOut: true }
  | { ok: false; error: "payments_off" | "foreign_order" | "wrong_amount" | "shop_mismatch" }
> {
  if (!input.config || !input.origin) return { ok: false, error: "payments_off" };
  const order = orderById(store, input.orderId);
  if (!order || order.account_id !== input.accountId || order.status !== "awaiting_payment") return { ok: false, error: "foreign_order" };
  let payment = paymentByOrder(store, order.id);
  if (!payment) {
    const idempotencyKey = randomUUID();
    payment = insertPendingPayment(store, { orderId: order.id, idempotencyKey, amountMinor: order.amount_minor, shopId: input.config.shopId });
  }
  if (payment.provider_payment_id && payment.checkout_url) {
    return { ok: true, idempotencyKey: payment.idempotency_key, checkoutUrl: payment.checkout_url };
  }
  const body = {
    amount: { value: yookassaValue(order.amount_minor), currency: "RUB" as const },
    capture: true,
    confirmation: { type: "redirect" as const, return_url: returnUrlFor(input.origin, order.id) },
    description: `ORASAKA VPN, ${order.term_months} мес.`,
    metadata: { orderId: order.id },
  };
  let remote: YooPayment;
  try {
    remote = await yooCreatePayment(input.config, payment.idempotency_key, body, input.opts);
  } catch (error) {
    if (error instanceof YooTimeoutError) return { ok: true, idempotencyKey: payment.idempotency_key, timedOut: true };
    throw error;
  }
  if (remote.amount.value !== yookassaValue(order.amount_minor) || remote.amount.currency !== "RUB") {
    return { ok: false, error: "wrong_amount" };
  }
  if (remote.recipient?.account_id && remote.recipient.account_id !== input.config.shopId) return { ok: false, error: "shop_mismatch" };
  attachPayment(store, order.id, {
    providerPaymentId: remote.id,
    test: remote.test === true,
    checkoutUrl: remote.confirmation?.confirmation_url ?? null,
  });
  return { ok: true, idempotencyKey: payment.idempotency_key, checkoutUrl: remote.confirmation?.confirmation_url ?? null };
}

export type IngestResult =
  | { result: "paid"; duplicate: boolean }
  | { result: "canceled" }
  | { result: "pending" }
  | { result: "rejected"; reason: "no_id" | "fetch_failed" | "foreign_order" | "wrong_amount" | "test_in_live" | "mode_mismatch" | "shop_mismatch" };

export async function ingestNotification(
  store: Store,
  config: YooConfig,
  body: unknown,
  now: number,
  opts?: FetchOpts,
): Promise<IngestResult> {
  const id = yookassaNotificationPaymentId(body);
  if (!id) return { result: "rejected", reason: "no_id" };
  let remote: YooPayment;
  try {
    remote = await yooGetPayment(config, id, opts);
  } catch {
    return { result: "rejected", reason: "fetch_failed" };
  }
  const orderId = remote.metadata?.orderId;
  if (!orderId) return { result: "rejected", reason: "foreign_order" };
  const order = orderById(store, orderId);
  const payment = order ? paymentByOrder(store, order.id) : null;
  if (!order || !payment) return { result: "rejected", reason: "foreign_order" };
  if (payment.provider_payment_id && payment.provider_payment_id !== remote.id) return { result: "rejected", reason: "foreign_order" };
  if (remote.recipient?.account_id !== config.shopId) return { result: "rejected", reason: "shop_mismatch" };
  if (remote.amount.currency !== order.currency || remote.amount.value !== yookassaValue(order.amount_minor)) {
    return { result: "rejected", reason: "wrong_amount" };
  }
  const isTest = remote.test === true;
  if (config.mode === "live" && isTest) return { result: "rejected", reason: "test_in_live" };
  if (config.mode === "test" && !isTest) return { result: "rejected", reason: "mode_mismatch" };
  if (!payment.provider_payment_id) {
    attachPayment(store, order.id, { providerPaymentId: remote.id, test: isTest, checkoutUrl: remote.confirmation?.confirmation_url ?? null });
  }
  if (remote.status === "canceled") {
    cancelOrder(store, order.id);
    return { result: "canceled" };
  }
  if (remote.status !== "succeeded") return { result: "pending" };
  const duplicate = markOrderPaid(store, order.id, now);
  return { result: "paid", duplicate };
}

export async function runFulfillment(store: Store, vpn: VpnAdapter, now: number): Promise<{ done: number; waiting: number }> {
  repairBilling(store, now);
  let done = 0;
  let waiting = 0;
  for (const job of dueFulfillments(store, now)) {
    const order = orderById(store, job.order_id);
    if (!order) continue;
    const account = accountById(store, order.account_id);
    if (!account) continue;
    const result = await vpn.grant(store, {
      orderId: order.id,
      accountId: account.id,
      telegramId: account.telegram_id,
      email: account.email,
      termMonths: order.term_months,
      now,
    });
    if (!result.ok && "durationUnconfigured" in result) {
      failFulfillment(store, order.id, "duration_unconfigured", now);
      continue;
    }
    if (!result.ok && "down" in result) {
      bumpFulfillment(store, order.id, now, "vpn_down");
      waiting++;
      continue;
    }
    if (!result.ok) {
      failFulfillment(store, order.id, "ref_conflict", now);
      continue;
    }
    finishFulfillment(store, order.id, result.ref, now);
    done++;
  }
  return { done, waiting };
}

/** Re-fetch a provider payment. The browser return URL is not an input. */
export async function reconcileOrder(
  store: Store,
  config: YooConfig,
  orderId: string,
  accountId: string,
  now: number,
  opts?: FetchOpts,
): Promise<"missing" | "foreign" | IngestResult> {
  const order = orderById(store, orderId);
  if (!order) return "missing";
  if (order.account_id !== accountId) return "foreign";
  const payment = paymentByOrder(store, order.id);
  if (!payment?.provider_payment_id || order.status !== "awaiting_payment") return { result: "pending" };
  return ingestNotification(store, config, { object: { id: payment.provider_payment_id } }, now, opts);
}

export function jobError(store: Store, orderId: string): string | null {
  return fulfillmentOf(store, orderId)?.last_error ?? null;
}
