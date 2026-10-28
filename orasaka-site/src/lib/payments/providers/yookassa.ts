import { ProviderDisabledError, type PaymentProviderAdapter } from "../types";

/*
 * YooKassa adapter — not connected. createPayment always throws.
 * The redirect body is built in yookassa-redirect.ts from the server catalog only.
 * Shop id and secret are not read in this build. No card data, no HMAC scheme.
 * A webhook is a hint to GET the payment; the return URL is not proof.
 */
export function createYookassaProvider(): PaymentProviderAdapter {
  const fail = async (): Promise<never> => {
    throw new ProviderDisabledError("yookassa");
  };
  return {
    id: "yookassa",
    label: "ЮKassa",
    capabilities: { currencies: ["RUB"], refunds: true, delayedConfirmation: true, webhookSignature: "none_refetch_required" },
    disabledReason: () => "Подключение оплаты ещё готовится: магазин ЮKassa не подключён.",
    createPayment: fail,
    verifyPayment: fail,
    validateWebhook: async () => false,
    parseWebhook: () => {
      throw new ProviderDisabledError("yookassa");
    },
    refund: fail,
  };
}
