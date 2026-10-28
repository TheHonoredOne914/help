import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  CreatePaymentInput,
  NormalizedWebhookEvent,
  PaymentProviderAdapter,
  PaymentStatus,
  ProviderPayment,
} from "../types";

/*
 * MOCK payment provider for demo mode. It simulates a hosted checkout with its
 * own "provider-side" state, signed webhooks and an authoritative status API,
 * so the site's verification flow can be exercised end to end. No money moves.
 */

export const MOCK_SIGNATURE_HEADER = "x-mock-signature";
export const MOCK_TIMESTAMP_HEADER = "x-mock-timestamp";
const REPLAY_WINDOW_MS = 5 * 60_000;

type GatewayPayment = ProviderPayment & { returnUrl: string };

export class MockGateway {
  /** Per-process secret; exists only on the server and never leaves it. */
  private readonly secret = randomBytes(32);
  private payments = new Map<string, GatewayPayment>();
  private byKey = new Map<string, string>();
  private seq = 0;

  create(input: CreatePaymentInput): GatewayPayment {
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return this.payments.get(existing)!;
    this.seq += 1;
    const id = `mockpay_${Date.now().toString(36)}${this.seq}`;
    const payment: GatewayPayment = {
      providerPaymentId: id,
      status: "pending",
      amount: { ...input.amount },
      orderId: input.orderId,
      environment: "mock",
      checkoutUrl: `/pay/mock/${id}`,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      returnUrl: input.returnUrl,
    };
    this.payments.set(id, payment);
    this.byKey.set(input.idempotencyKey, id);
    return payment;
  }

  get(id: string): GatewayPayment | null {
    return this.payments.get(id) ?? null;
  }

  /** The visitor's choice on the mock hosted page. Returns the signed webhook the "provider" would send. */
  complete(id: string, outcome: "succeeded" | "canceled") {
    const p = this.payments.get(id);
    if (!p || p.status !== "pending") return null;
    p.status = outcome;
    return this.signEvent({ eventId: `evt_${randomBytes(6).toString("hex")}`, providerPaymentId: id, status: outcome });
  }

  signEvent(event: NormalizedWebhookEvent, timestamp = Date.now()) {
    const body = JSON.stringify(event);
    const signature = this.sign(`${timestamp}.${body}`);
    const headers = new Headers({
      "content-type": "application/json",
      [MOCK_SIGNATURE_HEADER]: signature,
      [MOCK_TIMESTAMP_HEADER]: String(timestamp),
    });
    return { body, headers };
  }

  verifySignature(rawBody: string, headers: Headers, now = Date.now()): boolean {
    const sig = headers.get(MOCK_SIGNATURE_HEADER) ?? "";
    const ts = Number(headers.get(MOCK_TIMESTAMP_HEADER));
    if (!Number.isFinite(ts) || Math.abs(now - ts) > REPLAY_WINDOW_MS) return false;
    const expected = Buffer.from(this.sign(`${ts}.${rawBody}`), "hex");
    const given = Buffer.from(sig, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private sign(payload: string) {
    return createHmac("sha256", this.secret).update(payload).digest("hex");
  }
}

export function createMockProvider(gateway: MockGateway, enabled: boolean): PaymentProviderAdapter {
  const strip = ({ returnUrl, ...p }: GatewayPayment): ProviderPayment => {
    void returnUrl;
    return { ...p, amount: { ...p.amount } };
  };

  return {
    id: "mock",
    label: "Тестовая оплата (DEMO)",
    capabilities: { currencies: ["RUB"], refunds: false, delayedConfirmation: true, webhookSignature: "hmac" },
    disabledReason: () => (enabled ? null : "Тестовая оплата включается только в demo с PAYMENTS_MODE=mock"),

    /** MOCK: creates a payment in the in-memory gateway. */
    async createPayment(input) {
      return strip(gateway.create(input));
    },

    /** MOCK: reads the in-memory gateway state (stands in for the provider's status API). */
    async verifyPayment(id) {
      const p = gateway.get(id);
      if (!p) throw new Error("mock payment not found");
      return strip(p);
    },

    /** MOCK: HMAC-SHA256 over `${timestamp}.${body}` with a 5-minute replay window, constant-time compare. */
    async validateWebhook(rawBody, headers) {
      return gateway.verifySignature(rawBody, headers);
    },

    parseWebhook(rawBody) {
      const data = JSON.parse(rawBody) as { eventId?: unknown; providerPaymentId?: unknown; status?: unknown };
      const statuses: PaymentStatus[] = ["pending", "succeeded", "canceled", "failed", "expired"];
      if (typeof data.providerPaymentId !== "string" || !statuses.includes(data.status as PaymentStatus)) {
        throw new Error("malformed mock event");
      }
      return {
        eventId: typeof data.eventId === "string" ? data.eventId : null,
        providerPaymentId: data.providerPaymentId,
        status: data.status as PaymentStatus,
      };
    },
  };
}
