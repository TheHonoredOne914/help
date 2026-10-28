import { quotePlan } from "../catalog";

/**
 * Body for YooKassa `POST /v3/payments` with `confirmation.type = "redirect"`.
 * Docs: https://yookassa.ru/developers/api
 * Idempotence-Key is a header, stored before the call and reused after a timeout.
 * It is not part of this body. The amount comes only from `quotePlan`.
 * The return URL is where the buyer comes back; it does not prove payment.
 * Notifications are not HMAC-signed: https://yookassa.ru/developers/using-api/webhooks
 * A webhook only yields a payment id to GET. This file does not call the network.
 */

export type YookassaRedirectBody = {
  amount: { value: string; currency: "RUB" };
  capture: true;
  confirmation: { type: "redirect"; return_url: string };
  description: string;
  metadata: { orderId: string };
};

export function yookassaValue(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new RangeError("amount");
  const rub = Math.floor(amountMinor / 100);
  const kop = amountMinor % 100;
  return `${rub}.${String(kop).padStart(2, "0")}`;
}

export function yookassaRedirectBody(planId: string, orderId: string, returnUrl: string): YookassaRedirectBody | null {
  const plan = quotePlan(planId);
  if (!plan || !orderId || !returnUrl) return null;
  return {
    amount: { value: yookassaValue(plan.amountMinor), currency: "RUB" },
    capture: true,
    confirmation: { type: "redirect", return_url: returnUrl },
    description: `ORASAKA VPN, ${plan.months} мес.`,
    metadata: { orderId },
  };
}

/** Pulls the id to re-fetch. The notification JSON itself is not a paid status. */
export function yookassaNotificationPaymentId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const id = (body as { object?: { id?: unknown } }).object?.id;
  return typeof id === "string" && id.length > 0 && id.length <= 80 ? id : null;
}
