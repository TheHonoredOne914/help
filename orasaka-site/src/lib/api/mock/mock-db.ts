import { applyOrderStatus, type OrderStatus } from "@/lib/order-status";
import type { Money } from "@/lib/money";
import type { PaymentLedger, PaymentRecord, PaymentStatus } from "@/lib/payments/types";
import type { ApiResult, Device, DevicesResponse, Order, Plan, Subscription } from "../types";
import type { DemoPreset } from "../client";

/*
 * MOCK. In-memory TEST database for demo mode only — not connected to the bot,
 * FastAPI or Remnawave. It mirrors the rules the real backend must enforce:
 * idempotent order creation, ownership checks, server-side price snapshot,
 * monotonic statuses, single fulfilment per order, deduplicated payment events.
 */

type StoredOrder = Omit<Order, "paymentStatus"> & { userId: string; durationMonths: number };
type SubState = {
  expiresAt: string | null;
  planTitle: string | null;
  provisioning: Subscription["provisioning"];
  connectionToken: string | null;
};

const DAY = 86_400_000;
export const DEMO_DEVICE_LIMIT = 3;
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export class MockDb implements PaymentLedger {
  private sessions = new Map<string, { userId: string; expiresAt: number }>();
  private orders = new Map<string, StoredOrder>();
  private orderKeys = new Map<string, string>();
  private subs = new Map<string, SubState>();
  private devices = new Map<string, Device[]>();
  private payments = new Map<string, PaymentRecord>();
  private paymentKeys = new Map<string, string>();
  private processedEvents = new Set<string>();
  private fulfilled = new Set<string>();
  private provisionAt = new Map<string, number>();
  private seq = 0;

  constructor(
    private readonly plans: () => Plan[],
    private readonly opts: { provisioningDelayMs: number } = { provisioningDelayMs: 4000 },
  ) {}

  private nextId(prefix: string) {
    this.seq += 1;
    return `${prefix}-${Date.now().toString(36)}-${this.seq}`;
  }

  // ── sessions ────────────────────────────────────────────────────────────
  createSession(userId: string, now = Date.now()): string {
    const sid = crypto.randomUUID();
    this.sessions.set(sid, { userId, expiresAt: now + SESSION_TTL_MS });
    return sid;
  }

  resolveSession(sid: string | null, now = Date.now()): string | null {
    if (!sid) return null;
    const s = this.sessions.get(sid);
    if (!s || s.expiresAt < now) {
      this.sessions.delete(sid);
      return null;
    }
    return s.userId;
  }

  deleteSession(sid: string | null) {
    if (sid) this.sessions.delete(sid);
  }

  // ── orders ──────────────────────────────────────────────────────────────
  createOrder(
    userId: string,
    input: { planId: string; idempotencyKey: string; paymentMethod: string; kind: Order["kind"] },
    now = new Date(),
  ): ApiResult<Order> {
    const scopedKey = `${userId}:${input.idempotencyKey}`;
    const existingId = this.orderKeys.get(scopedKey);
    if (existingId) {
      const existing = this.orders.get(existingId)!;
      if (existing.planId !== input.planId || existing.kind !== input.kind) return { ok: false, error: "conflict" };
      return { ok: true, data: this.toPublic(existing) };
    }

    const plan = this.plans().find((p) => p.id === input.planId);
    if (!plan) return { ok: false, error: "not_found" };
    const rub = plan.prices.find((p) => p.currency === "RUB");
    if (!rub) return { ok: false, error: "method_unavailable" };
    if (input.kind === "renewal" && !this.subs.get(userId)?.expiresAt) return { ok: false, error: "conflict" };

    const order: StoredOrder = {
      id: this.nextId("test-order"),
      userId,
      kind: input.kind,
      planId: plan.id,
      planTitle: plan.title,
      durationMonths: plan.durationMonths,
      amount: { ...rub },
      status: "awaiting_payment",
      paymentMethod: input.paymentMethod,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
      test: true,
    };
    this.orders.set(order.id, order);
    this.orderKeys.set(scopedKey, order.id);
    return { ok: true, data: this.toPublic(order) };
  }

  getOrder(userId: string, orderId: string, now = new Date()): ApiResult<Order> {
    this.tick(now.getTime());
    const order = this.orders.get(orderId);
    // Another user's order is indistinguishable from a missing one.
    if (!order || order.userId !== userId) return { ok: false, error: "not_found" };
    if (order.status === "awaiting_payment" && order.expiresAt && new Date(order.expiresAt) < now) {
      order.status = applyOrderStatus(order.status, "expired");
    }
    return { ok: true, data: this.toPublic(order) };
  }

  listOrders(userId: string): Order[] {
    this.tick();
    return [...this.orders.values()]
      .filter((o) => o.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => this.toPublic(o));
  }

  cancelOrder(userId: string, orderId: string): ApiResult<Order> {
    const found = this.getOrder(userId, orderId);
    if (!found.ok) return found;
    const order = this.orders.get(orderId)!;
    if (applyOrderStatus(order.status, "cancelled") !== "cancelled") return { ok: false, error: "conflict" };
    order.status = "cancelled";
    return { ok: true, data: this.toPublic(order) };
  }

  // ── subscription / connection / devices ─────────────────────────────────
  getSubscription(userId: string, now = Date.now()): Subscription {
    this.tick(now);
    const sub = this.subs.get(userId);
    if (!sub?.expiresAt) {
      return { status: "none", expiresAt: null, planTitle: null, provisioning: sub?.provisioning ?? "none", test: true };
    }
    const active = new Date(sub.expiresAt).getTime() > now;
    return {
      status: active ? "active" : "expired",
      expiresAt: sub.expiresAt,
      planTitle: sub.planTitle,
      provisioning: sub.provisioning,
      test: true,
    };
  }

  getConnection(userId: string): ApiResult<{ url: string; test: true }> {
    const sub = this.getSubscription(userId);
    const token = this.subs.get(userId)?.connectionToken;
    if (sub.status !== "active" || !token) return { ok: false, error: "not_found" };
    return { ok: true, data: { url: `https://example.invalid/sub/${token}`, test: true } };
  }

  listDevices(userId: string): DevicesResponse {
    return { limit: DEMO_DEVICE_LIMIT, items: [...(this.devices.get(userId) ?? [])] };
  }

  removeDevice(userId: string, deviceId: string): ApiResult<DevicesResponse> {
    const list = this.devices.get(userId) ?? [];
    if (!list.some((d) => d.id === deviceId)) return { ok: false, error: "not_found" };
    this.devices.set(userId, list.filter((d) => d.id !== deviceId));
    return { ok: true, data: this.listDevices(userId) };
  }

  applyPreset(userId: string, preset: DemoPreset, now = Date.now()) {
    for (const [id, o] of this.orders) if (o.userId === userId) this.orders.delete(id);
    this.devices.delete(userId);
    this.subs.delete(userId);
    if (preset === "empty") return;

    const plan = this.plans()[0];
    const order: StoredOrder = {
      id: this.nextId("test-order"),
      userId,
      kind: "new",
      planId: plan?.id ?? "test",
      planTitle: plan?.title ?? "TEST",
      durationMonths: plan?.durationMonths ?? 1,
      amount: plan?.prices.find((p) => p.currency === "RUB") ?? { amountMinor: 100, currency: "RUB" },
      status: preset === "active" ? "active" : "provisioning_pending",
      paymentMethod: "mock",
      createdAt: new Date(now - (preset === "active" ? 3 * DAY : 0)).toISOString(),
      expiresAt: null,
      test: true,
    };
    this.orders.set(order.id, order);

    if (preset === "active") {
      this.fulfilled.add(order.id);
      this.subs.set(userId, {
        expiresAt: new Date(now + 27 * DAY).toISOString(),
        planTitle: order.planTitle,
        provisioning: "ready",
        connectionToken: `TEST-${crypto.randomUUID().slice(0, 8)}`,
      });
      this.devices.set(userId, [
        { id: "test-dev-1", name: "TEST · Android", platform: "Android", lastSeenAt: new Date(now - DAY).toISOString() },
        { id: "test-dev-2", name: "TEST · Windows", platform: "Windows", lastSeenAt: new Date(now - 2 * DAY).toISOString() },
      ]);
    } else {
      this.subs.set(userId, { expiresAt: null, planTitle: null, provisioning: "pending", connectionToken: null });
      // Stays pending until the visitor picks another preset: shows the "paid, access being prepared" state.
    }
  }

  // ── PaymentLedger (used by the payment service) ─────────────────────────
  findOrder(orderId: string) {
    const o = this.orders.get(orderId);
    return o ? { id: o.id, userId: o.userId, amount: o.amount as Money, status: o.status, paymentMethod: o.paymentMethod } : null;
  }

  savePayment(record: PaymentRecord) {
    this.payments.set(record.id, record);
    this.paymentKeys.set(record.idempotencyKey, record.id);
  }

  findPaymentByKey(key: string) {
    const id = this.paymentKeys.get(key);
    return id ? (this.payments.get(id) ?? null) : null;
  }

  findPaymentByProviderId(provider: string, providerPaymentId: string) {
    for (const p of this.payments.values()) {
      if (p.provider === provider && p.providerPaymentId === providerPaymentId) return p;
    }
    return null;
  }

  latestPaymentForOrder(orderId: string) {
    let latest: PaymentRecord | null = null;
    for (const p of this.payments.values()) {
      if (p.orderId === orderId && (!latest || p.createdAt > latest.createdAt)) latest = p;
    }
    return latest;
  }

  countPaymentsForOrder(orderId: string) {
    return [...this.payments.values()].filter((p) => p.orderId === orderId).length;
  }

  updatePaymentStatus(paymentId: string, status: PaymentStatus) {
    const p = this.payments.get(paymentId);
    if (p) p.status = status;
  }

  markEventProcessed(key: string): boolean {
    if (this.processedEvents.has(key)) return false;
    this.processedEvents.add(key);
    return true;
  }

  applyOrderStatus(orderId: string, incoming: OrderStatus): OrderStatus {
    const order = this.orders.get(orderId);
    if (!order) return incoming;
    order.status = applyOrderStatus(order.status, incoming);
    if (order.status === "paid") {
      order.status = applyOrderStatus(order.status, "provisioning_pending");
      const sub = this.subs.get(order.userId) ?? { expiresAt: null, planTitle: null, provisioning: "none", connectionToken: null };
      this.subs.set(order.userId, { ...sub, provisioning: "pending" });
      this.provisionAt.set(orderId, Date.now() + this.opts.provisioningDelayMs);
    }
    return order.status;
  }

  /** Simulated Remnawave provisioning: exactly one fulfilment per order id. */
  fulfil(orderId: string, now = Date.now()): boolean {
    const order = this.orders.get(orderId);
    if (!order || order.status !== "provisioning_pending" || this.fulfilled.has(orderId)) return false;
    this.fulfilled.add(orderId);
    this.provisionAt.delete(orderId);
    order.status = applyOrderStatus(order.status, "active");

    const sub = this.subs.get(order.userId);
    const base = Math.max(now, sub?.expiresAt ? new Date(sub.expiresAt).getTime() : 0);
    const expires = new Date(base);
    expires.setMonth(expires.getMonth() + order.durationMonths);
    this.subs.set(order.userId, {
      expiresAt: expires.toISOString(),
      planTitle: order.planTitle,
      provisioning: "ready",
      connectionToken: sub?.connectionToken ?? `TEST-${crypto.randomUUID().slice(0, 8)}`,
    });
    if (!this.devices.has(order.userId)) {
      this.devices.set(order.userId, [
        { id: `test-dev-${this.seq}`, name: "TEST · iPhone", platform: "iOS", lastSeenAt: new Date(now).toISOString() },
      ]);
    }
    return true;
  }

  private tick(now = Date.now()) {
    for (const [orderId, at] of this.provisionAt) if (now >= at) this.fulfil(orderId, now);
  }

  private toPublic(order: StoredOrder): Order {
    const { userId, durationMonths, ...rest } = order;
    void userId;
    void durationMonths;
    return { ...rest, paymentStatus: this.latestPaymentForOrder(order.id)?.status ?? null };
  }
}
