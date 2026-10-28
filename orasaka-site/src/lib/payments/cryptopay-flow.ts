import { yookassaValue } from "./yookassa-redirect";
import {
  cryptoCreateInvoice,
  cryptoFindByPayload,
  cryptoGetInvoice,
  cryptoSignatureValid,
  decimalToMinor,
  payUrlOf,
  CryptoTimeoutError,
  type CryptoConfig,
  type CryptoInvoice,
} from "./cryptopay-api";
import { returnUrlFor } from "../server/billing";
import {
  attachCryptoInvoice,
  beginCryptoAttempt,
  commitCryptoPaid,
  cryptoById,
  cryptoByInvoice,
  cryptoForOrder,
  orderById,
  retireCryptoAttempt,
  type Store,
} from "../server/store";

type FetchOpts = { fetchImpl?: typeof fetch; timeoutMs?: number };

function assetsIncludeUsdt(invoice: CryptoInvoice): boolean {
  const raw = invoice.accepted_assets;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  return list.map((item) => item.trim().toUpperCase()).includes("USDT");
}

function invoiceFits(invoice: CryptoInvoice, attemptId: string, amountMinor: number): boolean {
  if (invoice.payload !== attemptId) return false;
  if (invoice.currency_type !== "fiat" || invoice.fiat !== "RUB") return false;
  if (decimalToMinor(invoice.amount) !== amountMinor) return false;
  if (!assetsIncludeUsdt(invoice) && invoice.status !== "paid") return false;
  return true;
}

function remember(store: Store, attemptId: string, invoice: CryptoInvoice, test: boolean, status: string): void {
  attachCryptoInvoice(store, attemptId, {
    invoiceId: String(invoice.invoice_id),
    checkoutUrl: payUrlOf(invoice),
    test,
    status,
    paidAsset: invoice.paid_asset ?? null,
    paidAmount: invoice.paid_amount ?? null,
  });
}

export async function startCryptoPayment(
  store: Store,
  input: { accountId: string; orderId: string; origin: string; config: CryptoConfig | null; now: number; opts?: FetchOpts },
): Promise<
  | { ok: true; attemptId: string; checkoutUrl: string | null; timedOut?: false }
  | { ok: true; attemptId: string; checkoutUrl: null; timedOut: true }
  | { ok: false; error: "payments_off" | "foreign_order" | "wrong_amount" }
> {
  if (!input.config || !input.origin) return { ok: false, error: "payments_off" };
  const order = orderById(store, input.orderId);
  if (!order || order.account_id !== input.accountId || order.status !== "awaiting_payment") return { ok: false, error: "foreign_order" };
  let begun = beginCryptoAttempt(store, { orderId: order.id, amountMinor: order.amount_minor, now: input.now });
  if (!begun.fresh) {
    if (begun.row.checkout_url) return { ok: true, attemptId: begun.row.id, checkoutUrl: begun.row.checkout_url };
    let found: CryptoInvoice | null | "unknown";
    try {
      found = begun.row.provider_payment_id
        ? await cryptoGetInvoice(input.config, begun.row.provider_payment_id, input.opts)
        : await cryptoFindByPayload(input.config, begun.row.id, input.opts);
    } catch (error) {
      if (error instanceof CryptoTimeoutError) return { ok: true, attemptId: begun.row.id, checkoutUrl: null, timedOut: true };
      throw error;
    }
    if (found === "unknown") return { ok: true, attemptId: begun.row.id, checkoutUrl: null, timedOut: true };
    if (found && invoiceFits(found, begun.row.id, order.amount_minor)) {
      if (found.status === "paid") {
        const applied = applyInvoice(store, input.config, found, input.now);
        if (applied.result === "rejected") return { ok: false, error: "wrong_amount" };
      } else {
        remember(store, begun.row.id, found, input.config.mode === "test", "pending");
      }
      return { ok: true, attemptId: begun.row.id, checkoutUrl: payUrlOf(found) };
    }
    if (!found && !begun.row.provider_payment_id) {
      retireCryptoAttempt(store, begun.row.id);
      begun = beginCryptoAttempt(store, { orderId: order.id, amountMinor: order.amount_minor, now: input.now });
    } else {
      return { ok: true, attemptId: begun.row.id, checkoutUrl: null, timedOut: true };
    }
  }
  let remote: CryptoInvoice;
  try {
    remote = await cryptoCreateInvoice(
      input.config,
      {
        amount: yookassaValue(order.amount_minor),
        payload: begun.row.id,
        description: `ORASAKA VPN, ${order.term_months} мес.`,
        paid_btn_url: returnUrlFor(input.origin, order.id),
      },
      input.opts,
    );
  } catch (error) {
    if (error instanceof CryptoTimeoutError) return { ok: true, attemptId: begun.row.id, checkoutUrl: null, timedOut: true };
    throw error;
  }
  if (!invoiceFits(remote, begun.row.id, order.amount_minor)) return { ok: false, error: "wrong_amount" };
  const url = payUrlOf(remote);
  remember(store, begun.row.id, remote, input.config.mode === "test", "pending");
  return { ok: true, attemptId: begun.row.id, checkoutUrl: url };
}

export type CryptoIngest =
  | { result: "paid"; duplicate: boolean }
  | { result: "review" }
  | { result: "pending" }
  | { result: "expired" }
  | { result: "rejected"; reason: "signature" | "bad_body" | "no_id" | "fetch_failed" | "foreign_order" | "wrong_amount" | "asset" };

function applyInvoice(store: Store, cfg: CryptoConfig, invoice: CryptoInvoice, now: number): CryptoIngest {
  const attempt = (invoice.payload ? cryptoById(store, invoice.payload) : null) ?? cryptoByInvoice(store, String(invoice.invoice_id));
  if (!attempt) return { result: "rejected", reason: "foreign_order" };
  if (attempt.provider_payment_id && attempt.provider_payment_id !== String(invoice.invoice_id)) {
    return { result: "rejected", reason: "foreign_order" };
  }
  const order = orderById(store, attempt.order_id);
  if (!order || !invoiceFits(invoice, attempt.id, order.amount_minor)) return { result: "rejected", reason: "wrong_amount" };
  const test = cfg.mode === "test";
  if (invoice.status === "expired") {
    remember(store, attempt.id, invoice, test, "expired");
    return { result: "expired" };
  }
  if (invoice.status !== "paid") {
    remember(store, attempt.id, invoice, test, "pending");
    return { result: "pending" };
  }
  if (invoice.paid_asset !== "USDT" || !invoice.paid_amount || !/^\d{1,12}(\.\d{1,8})?$/.test(invoice.paid_amount)) {
    return { result: "rejected", reason: "asset" };
  }
  const committed = commitCryptoPaid(store, {
    attemptId: attempt.id,
    now,
    invoiceId: String(invoice.invoice_id),
    checkoutUrl: payUrlOf(invoice),
    test,
    paidAsset: invoice.paid_asset ?? null,
    paidAmount: invoice.paid_amount ?? null,
  });
  if (committed.review) return { result: "review" };
  return { result: "paid", duplicate: committed.duplicate };
}

export async function confirmCryptoInvoice(
  store: Store,
  cfg: CryptoConfig,
  invoiceId: string,
  now: number,
  opts?: FetchOpts,
): Promise<CryptoIngest> {
  let remote: CryptoInvoice | null;
  try {
    remote = await cryptoGetInvoice(cfg, invoiceId, opts);
  } catch (error) {
    if (error instanceof CryptoTimeoutError) return { result: "rejected", reason: "fetch_failed" };
    return { result: "rejected", reason: "fetch_failed" };
  }
  if (!remote) return { result: "rejected", reason: "fetch_failed" };
  return applyInvoice(store, cfg, remote, now);
}

export async function ingestCryptoWebhook(
  store: Store,
  cfg: CryptoConfig,
  rawBody: string,
  signature: string | null,
  now: number,
  opts?: FetchOpts,
): Promise<CryptoIngest> {
  if (!cryptoSignatureValid(cfg.token, rawBody, signature)) return { result: "rejected", reason: "signature" };
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { result: "rejected", reason: "bad_body" };
  }
  const payload = body && typeof body === "object" ? (body as { payload?: { invoice_id?: unknown } }).payload : undefined;
  const invoiceId = payload && typeof payload.invoice_id === "number" ? String(payload.invoice_id) : null;
  if (!invoiceId) return { result: "rejected", reason: "no_id" };
  return confirmCryptoInvoice(store, cfg, invoiceId, now, opts);
}

export async function reconcileCryptoOrder(
  store: Store,
  cfg: CryptoConfig,
  orderId: string,
  accountId: string,
  now: number,
  opts?: FetchOpts,
): Promise<CryptoIngest | "missing" | "foreign"> {
  const order = orderById(store, orderId);
  if (!order) return "missing";
  if (order.account_id !== accountId) return "foreign";
  const rows = cryptoForOrder(store, order.id).filter((row) => row.provider_payment_id);
  let last: CryptoIngest = { result: "pending" };
  for (const row of rows) {
    last = await confirmCryptoInvoice(store, cfg, row.provider_payment_id!, now, opts);
    if (last.result === "paid" || last.result === "review") return last;
  }
  return last;
}
