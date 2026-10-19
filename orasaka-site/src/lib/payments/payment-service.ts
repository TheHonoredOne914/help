import type { ApiResult } from "@/lib/api/types";
import type { OrderStatus } from "@/lib/order-status";
import type { ProviderRegistry } from "./registry";
import {
  PAYMENT_TO_ORDER_STATUS,
  type PaymentLedger,
  type PaymentProviderAdapter,
  type PaymentRecord,
} from "./types";

const ENVIRONMENT: Record<string, "mock" | "sandbox" | "production"> = { mock: "mock" };

/**
 * Orchestrates checkout against provider adapters. Order/payment state only
 * changes after the server re-fetches the payment from the provider: return
 * URLs and webhook bodies are treated as hints, never as proof.
 */
export class PaymentService {
  constructor(
    private readonly ledger: PaymentLedger,
    private readonly registry: ProviderRegistry,
    private readonly log: (msg: string, meta?: Record<string, unknown>) => void = () => {},
  ) {}

  private enabledAdapter(id: string): PaymentProviderAdapter | null {
    const adapter = this.registry.get(id);
    return adapter && adapter.disabledReason() === null ? adapter : null;
  }

  /** Starts or resumes payment for an order; repeated clicks reuse the same provider payment. */
  async startPayment(orderId: string, methodId: string, returnUrl: string): Promise<ApiResult<{ checkoutUrl: string }>> {
    const adapter = this.enabledAdapter(methodId);
    if (!adapter) return { ok: false, error: "method_unavailable" };
    const order = this.ledger.findOrder(orderId);
    if (!order) return { ok: false, error: "not_found" };
    if (order.status !== "awaiting_payment") return { ok: false, error: "conflict" };

    let record = this.ledger.latestPaymentForOrder(orderId);
    if (record && record.provider === methodId && record.status === "pending" && record.checkoutUrl) {
      return { ok: true, data: { checkoutUrl: record.checkoutUrl } };
    }
    if (!record || record.provider !== methodId || record.status !== "pending") {
      record = {
        id: `pay-${crypto.randomUUID()}`,
        orderId,
        provider: methodId,
        providerPaymentId: null,
        idempotencyKey: crypto.randomUUID(),
        amount: { ...order.amount },
        status: "pending",
        checkoutUrl: null,
        createdAt: new Date().toISOString(),
      };
      // Persist the key before calling the provider so a retry after a timeout reuses it.
      this.ledger.savePayment(record);
    }

    try {
      const created = await adapter.createPayment({
        orderId,
        amount: record.amount,
        idempotencyKey: record.idempotencyKey,
        returnUrl,
        description: `ORASAKA VPN, заказ ${orderId}`,
      });
      const updated: PaymentRecord = { ...record, providerPaymentId: created.providerPaymentId, checkoutUrl: created.checkoutUrl };
      this.ledger.savePayment(updated);
      if (!created.checkoutUrl) return { ok: false, error: "verification_failed" };
      return { ok: true, data: { checkoutUrl: created.checkoutUrl } };
    } catch (err) {
      this.log("createPayment failed", { orderId, provider: methodId, err: String(err) });
      return { ok: false, error: "unavailable" };
    }
  }

  /** Return-page / polling path: asks the provider for the real status. */
  async verifyOrder(orderId: string): Promise<ApiResult<OrderStatus>> {
    const order = this.ledger.findOrder(orderId);
    if (!order) return { ok: false, error: "not_found" };
    const record = this.ledger.latestPaymentForOrder(orderId);
    if (!record?.providerPaymentId) return { ok: true, data: order.status };
    return this.reconcile(record);
  }

  /** Webhook path: authenticate, dedupe, then re-fetch — the body's status is never applied directly. */
  async handleWebhook(providerId: string, rawBody: string, headers: Headers): Promise<ApiResult<{ duplicate: boolean }>> {
    const adapter = this.enabledAdapter(providerId);
    if (!adapter) return { ok: false, error: "not_found" };

    const authentic = await adapter.validateWebhook(rawBody, headers);
    if (adapter.capabilities.webhookSignature === "hmac" && !authentic) {
      this.log("webhook signature rejected", { providerId });
      return { ok: false, error: "forbidden" };
    }

    let event;
    try {
      event = adapter.parseWebhook(rawBody);
    } catch {
      return { ok: false, error: "bad_request" };
    }

    const record = this.ledger.findPaymentByProviderId(providerId, event.providerPaymentId);
    if (!record) return { ok: false, error: "not_found" };

    const result = await this.reconcile(record);
    if (!result.ok) return result;

    const dedupeKey = `${providerId}:${event.eventId ?? `${event.providerPaymentId}:${event.status}`}`;
    return { ok: true, data: { duplicate: !this.ledger.markEventProcessed(dedupeKey) } };
  }

  private async reconcile(record: PaymentRecord): Promise<ApiResult<OrderStatus>> {
    const adapter = this.enabledAdapter(record.provider);
    const order = this.ledger.findOrder(record.orderId);
    if (!adapter || !order || !record.providerPaymentId) return { ok: false, error: "verification_failed" };

    let remote;
    try {
      remote = await adapter.verifyPayment(record.providerPaymentId);
    } catch (err) {
      this.log("verifyPayment failed", { orderId: record.orderId, err: String(err) });
      return { ok: false, error: "verification_failed" };
    }

    const matches =
      remote.providerPaymentId === record.providerPaymentId &&
      remote.orderId === record.orderId &&
      remote.amount.amountMinor === record.amount.amountMinor &&
      remote.amount.currency === record.amount.currency &&
      remote.amount.amountMinor === order.amount.amountMinor &&
      remote.amount.currency === order.amount.currency &&
      remote.environment === (ENVIRONMENT[record.provider] ?? "production");
    if (!matches) {
      this.log("payment verification mismatch", { orderId: record.orderId, provider: record.provider });
      return { ok: false, error: "verification_failed" };
    }

    this.ledger.updatePaymentStatus(record.id, remote.status);
    const target = PAYMENT_TO_ORDER_STATUS[remote.status];
    const status = target ? this.ledger.applyOrderStatus(record.orderId, target) : order.status;
    return { ok: true, data: status };
  }
}
