import "server-only";
import type { Currency } from "@/lib/money";
import type { OrderStatus } from "@/lib/order-status";

/*
 * Contract for payment providers. Real adapters belong to the existing
 * FastAPI/payment service; Next.js only consumes it. Nothing here talks to a
 * real provider.
 */

export type CreateCheckoutInput = {
  orderId: string;
  amountMinor: number;
  currency: Currency;
  idempotencyKey: string;
  /** Must come from the server-side allowlist, never from the browser. */
  returnUrl: string;
};

export type CheckoutSession = {
  providerPaymentId: string;
  checkoutUrl: string;
  normalizedStatus: OrderStatus;
  expiresAt: string | null;
};

export type NormalizedPaymentEvent = {
  provider: string;
  providerPaymentId: string;
  providerEventId: string | null;
  orderId: string;
  amountMinor: number;
  currency: Currency;
  environment: "sandbox" | "production" | "mock";
  status: OrderStatus;
};

export interface PaymentProviderAdapter {
  readonly id: string;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;
  fetchPayment(providerPaymentId: string): Promise<CheckoutSession>;
  validateWebhook(rawBody: string, headers: Headers): Promise<boolean>;
  normalizeEvent(rawBody: string): Promise<NormalizedPaymentEvent>;
  refund?(providerPaymentId: string, amountMinor: number, idempotencyKey: string): Promise<void>;
}

export type ProviderCapabilities = {
  id: string;
  label: string;
  currencies: Currency[];
  refunds: boolean;
  delayedConfirmation: boolean;
  status: "enabled" | "disabled" | "pending_integration";
};

export const PROVIDER_REGISTRY: ProviderCapabilities[] = [
  { id: "mock", label: "Тестовая оплата (demo)", currencies: ["RUB"], refunds: false, delayedConfirmation: true, status: "disabled" },
  { id: "yookassa", label: "ЮKassa", currencies: ["RUB"], refunds: true, delayedConfirmation: true, status: "pending_integration" },
  { id: "crypto", label: "Криптовалюта", currencies: [], refunds: false, delayedConfirmation: true, status: "disabled" },
];

export const ALLOWED_RETURN_PATHS = ["/payment/return"] as const;

export function buildReturnUrl(origin: string, orderId: string): string {
  const url = new URL(ALLOWED_RETURN_PATHS[0], origin);
  url.searchParams.set("orderId", orderId);
  return url.toString();
}
