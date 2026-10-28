import type { Currency, Money } from "@/lib/money";
import type { OrderStatus } from "@/lib/order-status";

export type PaymentStatus = "pending" | "succeeded" | "canceled" | "failed" | "expired";

export type CreatePaymentInput = {
  orderId: string;
  amount: Money;
  /** Stored before the provider call and reused on network retries. */
  idempotencyKey: string;
  /** Built server-side from the allowlist, never taken from the browser. */
  returnUrl: string;
  description: string;
};

/** Provider view of a payment, as fetched from the provider's authenticated API. */
export type ProviderPayment = {
  providerPaymentId: string;
  status: PaymentStatus;
  amount: Money;
  /** Internal order id echoed back via provider metadata. */
  orderId: string;
  environment: "mock" | "sandbox" | "production";
  checkoutUrl: string | null;
  expiresAt: string | null;
};

export type NormalizedWebhookEvent = {
  /** Provider event id when the protocol has one; dedupe falls back to payment id + status. */
  eventId: string | null;
  providerPaymentId: string;
  status: PaymentStatus;
};

export type ProviderCapabilities = {
  currencies: Currency[];
  refunds: boolean;
  delayedConfirmation: boolean;
  webhookSignature: "hmac" | "none_refetch_required";
};

export interface PaymentProviderAdapter {
  readonly id: string;
  readonly label: string;
  readonly capabilities: ProviderCapabilities;
  /** Why the adapter is off; null when enabled. */
  disabledReason(): string | null;
  createPayment(input: CreatePaymentInput): Promise<ProviderPayment>;
  /** Authoritative status lookup. Every confirmation path must go through this. */
  verifyPayment(providerPaymentId: string): Promise<ProviderPayment>;
  /** Signature / authenticity check of the raw webhook body, if the protocol supports it. */
  validateWebhook(rawBody: string, headers: Headers): Promise<boolean>;
  parseWebhook(rawBody: string): NormalizedWebhookEvent;
  refund?(providerPaymentId: string, amount: Money, idempotencyKey: string): Promise<void>;
}

export class ProviderDisabledError extends Error {
  constructor(public readonly providerId: string) {
    super(`Payment provider "${providerId}" is disabled`);
  }
}

export type PaymentRecord = {
  id: string;
  orderId: string;
  provider: string;
  /** Null while the provider call is in flight or failed; the record (and its key) is reused on retry. */
  providerPaymentId: string | null;
  idempotencyKey: string;
  amount: Money;
  status: PaymentStatus;
  checkoutUrl: string | null;
  createdAt: string;
};

/** Persistence the payment service needs. Implemented by the mock DB; owned by FastAPI in production. */
export interface PaymentLedger {
  findOrder(orderId: string): { id: string; userId: string; amount: Money; status: OrderStatus; paymentMethod: string | null } | null;
  savePayment(record: PaymentRecord): void;
  findPaymentByKey(key: string): PaymentRecord | null;
  findPaymentByProviderId(provider: string, providerPaymentId: string): PaymentRecord | null;
  latestPaymentForOrder(orderId: string): PaymentRecord | null;
  countPaymentsForOrder(orderId: string): number;
  updatePaymentStatus(paymentId: string, status: PaymentStatus): void;
  /** Returns false when the event key was already processed (replay). */
  markEventProcessed(key: string): boolean;
  applyOrderStatus(orderId: string, status: OrderStatus): OrderStatus;
}

/** Only a verified success moves the order; a cancelled/failed payment leaves it payable again. */
export const PAYMENT_TO_ORDER_STATUS: Record<PaymentStatus, OrderStatus | null> = {
  pending: null,
  succeeded: "paid",
  canceled: null,
  failed: null,
  expired: null,
};
