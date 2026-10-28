import { quotePlan } from "../catalog";
import { startCryptoPayment } from "../payments/cryptopay-flow";
import type { CryptoConfig } from "../payments/cryptopay-api";
import { cryptoChargeReady, paymentsReady } from "../payments/ready";
import type { YooConfig } from "../payments/yookassa-api";
import { accountById, type Store } from "./store";
import { placeOrder, startPayment } from "./billing";

export type CheckoutMethod = "yookassa" | "cryptopay";

/** Amount comes from quotePlan. A client amount is not a parameter. */
export async function startSiteCheckout(
  store: Store,
  input: {
    accountId: string;
    planId: string;
    idempotencyKey: string;
    origin: string;
    now: number;
    config: YooConfig | null;
    method?: CheckoutMethod;
    crypto?: CryptoConfig | null;
  },
): Promise<
  | { ok: true; orderId: string; amountMinor: number; checkoutUrl: string | null; timedOut?: boolean; method: CheckoutMethod }
  | { ok: false; error: "payments_off" | "unknown_plan" | "bad_key" | "conflict" | "foreign_order" | "wrong_amount" | "shop_mismatch" }
> {
  const method: CheckoutMethod = input.method ?? "yookassa";
  if (method === "yookassa" && (!paymentsReady() || !input.config)) return { ok: false, error: "payments_off" };
  if (method === "cryptopay" && (!cryptoChargeReady() || !input.crypto)) return { ok: false, error: "payments_off" };
  const plan = quotePlan(input.planId);
  if (!plan) return { ok: false, error: "unknown_plan" };
  const account = accountById(store, input.accountId);
  if (!account) return { ok: false, error: "foreign_order" };
  const placed = placeOrder(store, {
    accountId: account.id,
    planId: plan.id,
    kind: account.vpn_user_ref ? "renewal" : "new",
    idempotencyKey: input.idempotencyKey,
    now: input.now,
  });
  if ("error" in placed) return { ok: false, error: placed.error };
  const started =
    method === "cryptopay"
      ? await startCryptoPayment(store, {
          accountId: account.id,
          orderId: placed.id,
          origin: input.origin,
          config: input.crypto ?? null,
          now: input.now,
        })
      : await startPayment(store, {
          accountId: account.id,
          orderId: placed.id,
          origin: input.origin,
          config: input.config,
          now: input.now,
        });
  if (!started.ok) return started;
  return {
    ok: true,
    method,
    orderId: placed.id,
    amountMinor: placed.amount_minor,
    checkoutUrl: "timedOut" in started && started.timedOut ? null : started.checkoutUrl ?? null,
    timedOut: "timedOut" in started ? started.timedOut : false,
  };
}
