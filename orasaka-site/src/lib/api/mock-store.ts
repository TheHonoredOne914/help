import { applyOrderStatus, type OrderStatus } from "@/lib/order-status";
import type { ApiResult, Order, Plan } from "./types";

/**
 * In-memory TEST order store for demo mode only. It mirrors the server rules the
 * real backend must enforce: idempotent create, ownership checks, server-side
 * price snapshot and monotonic status transitions.
 */
export class MockOrderStore {
  private orders = new Map<string, Order & { userId: string }>();
  private byIdempotencyKey = new Map<string, string>();
  private fulfilled = new Set<string>();
  private seq = 0;

  constructor(private readonly plans: () => Plan[]) {}

  create(userId: string, planId: string, idempotencyKey: string, now = new Date()): ApiResult<Order> {
    const scopedKey = `${userId}:${idempotencyKey}`;
    const existingId = this.byIdempotencyKey.get(scopedKey);
    if (existingId) {
      const existing = this.orders.get(existingId)!;
      if (existing.planId !== planId) return { ok: false, error: "conflict" };
      return { ok: true, data: strip(existing) };
    }

    const plan = this.plans().find((p) => p.id === planId);
    if (!plan) return { ok: false, error: "not_found" };

    const rub = plan.prices.find((p) => p.currency === "RUB");
    if (!rub) return { ok: false, error: "bad_request" };

    this.seq += 1;
    const order: Order & { userId: string } = {
      id: `test-${now.getTime().toString(36)}-${this.seq}`,
      userId,
      planId: plan.id,
      planTitle: plan.title,
      amount: { ...rub },
      status: "awaiting_payment",
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
      test: true,
    };
    this.orders.set(order.id, order);
    this.byIdempotencyKey.set(scopedKey, order.id);
    return { ok: true, data: strip(order) };
  }

  get(userId: string, orderId: string, now = new Date()): ApiResult<Order> {
    const order = this.orders.get(orderId);
    // Another user's order is indistinguishable from a missing one.
    if (!order || order.userId !== userId) return { ok: false, error: "not_found" };
    if (order.status === "awaiting_payment" && order.expiresAt && new Date(order.expiresAt) < now) {
      order.status = applyOrderStatus(order.status, "expired");
    }
    return { ok: true, data: strip(order) };
  }

  /** Simulates a verified provider event; repeated events are deduplicated. */
  applyEvent(orderId: string, status: OrderStatus): void {
    const order = this.orders.get(orderId);
    if (!order) return;
    order.status = applyOrderStatus(order.status, status);
    if (order.status === "paid") order.status = applyOrderStatus(order.status, "provisioning_pending");
  }

  /** Single fulfilment per order id, regardless of how many webhooks/polls trigger it. */
  fulfil(orderId: string): boolean {
    const order = this.orders.get(orderId);
    if (!order || order.status !== "provisioning_pending" || this.fulfilled.has(orderId)) return false;
    this.fulfilled.add(orderId);
    order.status = applyOrderStatus(order.status, "active");
    return true;
  }

  cancel(userId: string, orderId: string): ApiResult<Order> {
    const found = this.get(userId, orderId);
    if (!found.ok) return found;
    const order = this.orders.get(orderId)!;
    const next = applyOrderStatus(order.status, "cancelled");
    if (next !== "cancelled") return { ok: false, error: "conflict" };
    order.status = next;
    return { ok: true, data: strip(order) };
  }
}

function strip(order: Order & { userId: string }): Order {
  const { userId, ...rest } = order;
  void userId;
  return rest;
}
