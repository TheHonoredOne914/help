import { ProviderDisabledError, type PaymentProviderAdapter } from "../types";

/*
 * YooKassa adapter — STUB, always disabled in this build.
 *
 * Intended behaviour once a separate, provider-approved shop exists (and only
 * inside the existing FastAPI payment service or after agreement with its owner):
 *  - createPayment: POST https://api.yookassa.ru/v3/payments, Basic auth shopId:secretKey,
 *    `Idempotence-Key` = stored key, confirmation.type = "redirect" with allowlisted return_url,
 *    metadata.orderId = internal order id. Hosted checkout only; no card data on this site.
 *  - verifyPayment: GET /v3/payments/{id}; compare amount, currency, shop, metadata.orderId, status.
 *  - Webhooks are not signed: never trust the body. Re-fetch via verifyPayment; IP allowlist
 *    from the docs is an extra layer behind a trusted proxy only.
 * Credentials live in backend secret storage, never in NEXT_PUBLIC_* or the client bundle.
 */
export function createYookassaProvider(): PaymentProviderAdapter {
  const fail = async (): Promise<never> => {
    throw new ProviderDisabledError("yookassa");
  };
  return {
    id: "yookassa",
    label: "ЮKassa (банковская карта, СБП)",
    capabilities: { currencies: ["RUB"], refunds: true, delayedConfirmation: true, webhookSignature: "none_refetch_required" },
    disabledReason: () => "Интеграция не подключена: нужен согласованный магазин и аудит текущей интеграции backend",
    createPayment: fail,
    verifyPayment: fail,
    validateWebhook: async () => false,
    parseWebhook: () => {
      throw new ProviderDisabledError("yookassa");
    },
    refund: fail,
  };
}
