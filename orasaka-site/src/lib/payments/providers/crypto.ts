import { ProviderDisabledError, type PaymentProviderAdapter } from "../types";

/*
 * Crypto adapter — STUB, always disabled. No provider is selected and no wallets
 * are configured. Enabling requires a legal opinion and a provider that accepts
 * VPN merchants for the seller's and buyer's jurisdictions (KYC/AML, sanctions).
 * A real adapter must handle asset/network, rate/invoice expiry, confirmations,
 * under/overpayment, reorgs and refunds, and must never credit from a client-sent tx hash.
 */
export function createCryptoProvider(): PaymentProviderAdapter {
  const fail = async (): Promise<never> => {
    throw new ProviderDisabledError("crypto");
  };
  return {
    id: "crypto",
    label: "Криптовалюта",
    capabilities: { currencies: [], refunds: false, delayedConfirmation: true, webhookSignature: "hmac" },
    disabledReason: () => "Отключено до юридического заключения и выбора провайдера",
    createPayment: fail,
    verifyPayment: fail,
    validateWebhook: async () => false,
    parseWebhook: () => {
      throw new ProviderDisabledError("crypto");
    },
  };
}
