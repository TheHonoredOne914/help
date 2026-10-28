import { ProviderDisabledError, type PaymentProviderAdapter, type ProviderPayment } from "../types";
import {
  cryptoCreateInvoice,
  cryptoGetInvoice,
  cryptoSignatureValid,
  decimalToMinor,
  payUrlOf,
  readCryptoConfig,
  type CryptoInvoice,
} from "../cryptopay-api";
import { cryptoChargeReady } from "../ready";
import { yookassaValue } from "../yookassa-redirect";

function toPayment(invoice: CryptoInvoice, orderId: string, mode: "test" | "live"): ProviderPayment {
  const minor = decimalToMinor(invoice.amount);
  if (minor === null) throw new Error("cryptopay amount");
  const status = invoice.status === "paid" ? "succeeded" : invoice.status === "expired" ? "expired" : "pending";
  return {
    providerPaymentId: String(invoice.invoice_id),
    status,
    amount: { amountMinor: minor, currency: "RUB" },
    orderId,
    environment: mode === "test" ? "sandbox" : "production",
    checkoutUrl: payUrlOf(invoice),
    expiresAt: null,
  };
}

/**
 * Crypto Pay (@CryptoBot), USDT via a RUB fiat invoice.
 * Off unless CRYPTOPAY_ENABLED, a token, a mode, and the shared term gate are set.
 * The public order path uses cryptopay-flow.ts so a second paid invoice is kept for review.
 */
export function createCryptoProvider(): PaymentProviderAdapter {
  return {
    id: "crypto",
    label: "USDT",
    capabilities: { currencies: ["RUB"], refunds: false, delayedConfirmation: true, webhookSignature: "hmac" },
    disabledReason: () => (cryptoChargeReady() ? null : "USDT через Crypto Pay не подключён. Это не боевой счёт."),
    async createPayment(input) {
      const cfg = readCryptoConfig();
      if (!cfg || !cryptoChargeReady()) throw new ProviderDisabledError("crypto");
      const invoice = await cryptoCreateInvoice(cfg, {
        amount: yookassaValue(input.amount.amountMinor),
        payload: input.idempotencyKey,
        description: input.description,
        paid_btn_url: input.returnUrl,
      });
      if (invoice.payload !== input.idempotencyKey || decimalToMinor(invoice.amount) !== input.amount.amountMinor) {
        throw new Error("cryptopay mismatch");
      }
      return toPayment(invoice, input.orderId, cfg.mode);
    },
    async verifyPayment(providerPaymentId) {
      const cfg = readCryptoConfig();
      if (!cfg || !cryptoChargeReady()) throw new ProviderDisabledError("crypto");
      const invoice = await cryptoGetInvoice(cfg, providerPaymentId);
      if (!invoice) throw new Error("cryptopay missing");
      return toPayment(invoice, invoice.payload ?? "", cfg.mode);
    },
    async validateWebhook(rawBody, headers) {
      const cfg = readCryptoConfig();
      if (!cfg) return false;
      return cryptoSignatureValid(cfg.token, rawBody, headers.get("crypto-pay-api-signature"));
    },
    parseWebhook(rawBody) {
      const cfg = readCryptoConfig();
      if (!cfg || !cryptoChargeReady()) throw new ProviderDisabledError("crypto");
      const body = JSON.parse(rawBody) as { update_id?: unknown; payload?: CryptoInvoice };
      const invoice = body.payload;
      if (!invoice || typeof invoice.invoice_id !== "number") throw new Error("cryptopay webhook");
      const status = invoice.status === "paid" ? "succeeded" : invoice.status === "expired" ? "expired" : "pending";
      return { eventId: null, providerPaymentId: String(invoice.invoice_id), status };
    },
  };
}
