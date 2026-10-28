import { describe, expect, it } from "vitest";
import { MockDb } from "../src/lib/api/mock/mock-db";
import type { Plan } from "../src/lib/api/types";
import { PaymentService } from "../src/lib/payments/payment-service";
import { createCryptoProvider } from "../src/lib/payments/providers/crypto";
import { createMockProvider, MOCK_TIMESTAMP_HEADER, MockGateway } from "../src/lib/payments/providers/mock-provider";
import { createYookassaProvider } from "../src/lib/payments/providers/yookassa";
import { createRegistry, listPaymentMethods } from "../src/lib/payments/registry";
import type { PaymentProviderAdapter } from "../src/lib/payments/types";

const plans: Plan[] = [
  { id: "p1", title: "TEST 1", durationMonths: 1, prices: [{ amountMinor: 100, currency: "RUB" }], conditions: [], test: true },
];

function setup(wrap: (a: PaymentProviderAdapter) => PaymentProviderAdapter = (a) => a) {
  const db = new MockDb(() => plans, { provisioningDelayMs: 0 });
  const gateway = new MockGateway();
  const registry = createRegistry([wrap(createMockProvider(gateway, true)), createYookassaProvider(), createCryptoProvider()]);
  const service = new PaymentService(db, registry);
  const order = db.createOrder("u1", { planId: "p1", idempotencyKey: "key-1", paymentMethod: "mock", kind: "new" });
  if (!order.ok) throw new Error("setup");
  return { db, gateway, service, orderId: order.data.id };
}

const paymentIdFrom = (url: string) => url.split("/").pop()!;

describe("payment registry", () => {
  it("keeps real providers disabled", () => {
    const methods = listPaymentMethods(createRegistry([createYookassaProvider(), createCryptoProvider()]));
    expect(methods.find((m) => m.id === "yookassa")?.status).toBe("pending_integration");
    expect(methods.find((m) => m.id === "crypto")?.status).toBe("disabled");
    expect(methods.find((m) => m.id === "telegram_stars")?.status).toBe("bot_only");
    expect(methods.some((m) => m.status === "enabled")).toBe(false);
  });

  it("refuses to start a payment with a disabled provider", async () => {
    const { service, orderId } = setup();
    expect(await service.startPayment(orderId, "yookassa", "/r")).toEqual({ ok: false, error: "method_unavailable" });
  });
});

describe("payment service", () => {
  it("reuses the same provider payment on repeated start", async () => {
    const { service, db, orderId } = setup();
    const a = await service.startPayment(orderId, "mock", "/r");
    const b = await service.startPayment(orderId, "mock", "/r");
    expect(a.ok && b.ok && a.data.checkoutUrl === b.data.checkoutUrl).toBe(true);
    expect(db.countPaymentsForOrder(orderId)).toBe(1);
  });

  it("does not move the order before the provider confirms", async () => {
    const { service, db, orderId } = setup();
    await service.startPayment(orderId, "mock", "/r");
    expect(await service.verifyOrder(orderId)).toEqual({ ok: true, data: "awaiting_payment" });
    expect(db.getSubscription("u1").status).toBe("none");
  });

  it("activates after a verified, signed webhook and ignores a replay", async () => {
    const { service, db, gateway, orderId } = setup();
    const started = await service.startPayment(orderId, "mock", "/r");
    if (!started.ok) throw new Error("setup");
    const event = gateway.complete(paymentIdFrom(started.data.checkoutUrl), "succeeded")!;

    expect(await service.handleWebhook("mock", event.body, event.headers)).toEqual({ ok: true, data: { duplicate: false } });
    expect(await service.handleWebhook("mock", event.body, event.headers)).toEqual({ ok: true, data: { duplicate: true } });

    const order = db.getOrder("u1", orderId);
    expect(order.ok && order.data.status).toBe("active");
    const sub = db.getSubscription("u1");
    expect(sub.status).toBe("active");
    // Replay must not extend the subscription a second time.
    const months = (new Date(sub.expiresAt!).getTime() - Date.now()) / (30 * 86_400_000);
    expect(months).toBeLessThan(1.1);
  });

  it("rejects a tampered body and a stale timestamp", async () => {
    const { service, gateway, orderId } = setup();
    const started = await service.startPayment(orderId, "mock", "/r");
    if (!started.ok) throw new Error("setup");
    const id = paymentIdFrom(started.data.checkoutUrl);
    const event = gateway.complete(id, "succeeded")!;

    const tampered = event.body.replace("succeeded", "pending");
    expect(await service.handleWebhook("mock", tampered, event.headers)).toEqual({ ok: false, error: "forbidden" });

    const stale = gateway.signEvent({ eventId: "e-old", providerPaymentId: id, status: "succeeded" }, Date.now() - 10 * 60_000);
    expect(await service.handleWebhook("mock", stale.body, stale.headers)).toEqual({ ok: false, error: "forbidden" });

    const noTs = new Headers(event.headers);
    noTs.delete(MOCK_TIMESTAMP_HEADER);
    expect(await service.handleWebhook("mock", event.body, noTs)).toEqual({ ok: false, error: "forbidden" });
  });

  it("never trusts the webhook body: a forged 'succeeded' for a pending payment changes nothing", async () => {
    const { service, db, gateway, orderId } = setup();
    const started = await service.startPayment(orderId, "mock", "/r");
    if (!started.ok) throw new Error("setup");
    const forged = gateway.signEvent({ eventId: "e1", providerPaymentId: paymentIdFrom(started.data.checkoutUrl), status: "succeeded" });
    await service.handleWebhook("mock", forged.body, forged.headers);
    const order = db.getOrder("u1", orderId);
    expect(order.ok && order.data.status).toBe("awaiting_payment");
  });

  it("fails verification on an amount mismatch", async () => {
    const { service, db, gateway, orderId } = setup((a) => ({
      ...a,
      async verifyPayment(id) {
        const p = await a.verifyPayment(id);
        return { ...p, amount: { ...p.amount, amountMinor: p.amount.amountMinor - 1 } };
      },
    }));
    const started = await service.startPayment(orderId, "mock", "/r");
    if (!started.ok) throw new Error("setup");
    gateway.complete(paymentIdFrom(started.data.checkoutUrl), "succeeded");
    expect(await service.verifyOrder(orderId)).toEqual({ ok: false, error: "verification_failed" });
    expect(db.getSubscription("u1").status).toBe("none");
  });

  it("keeps the order payable after a cancelled payment and starts a fresh one", async () => {
    const { service, db, gateway, orderId } = setup();
    const first = await service.startPayment(orderId, "mock", "/r");
    if (!first.ok) throw new Error("setup");
    gateway.complete(paymentIdFrom(first.data.checkoutUrl), "canceled");
    await service.verifyOrder(orderId);

    const order = db.getOrder("u1", orderId);
    expect(order.ok && order.data).toMatchObject({ status: "awaiting_payment", paymentStatus: "canceled" });
    expect(db.getSubscription("u1").status).toBe("none");

    const second = await service.startPayment(orderId, "mock", "/r");
    expect(second.ok && second.data.checkoutUrl).not.toBe(first.data.checkoutUrl);
  });

  it("renewal extends from the current expiry", async () => {
    const { service, db, gateway, orderId } = setup();
    const started = await service.startPayment(orderId, "mock", "/r");
    if (!started.ok) throw new Error("setup");
    gateway.complete(paymentIdFrom(started.data.checkoutUrl), "succeeded");
    await service.verifyOrder(orderId);
    const firstExpiry = new Date(db.getSubscription("u1").expiresAt!).getTime();

    const renewal = db.createOrder("u1", { planId: "p1", idempotencyKey: "key-2", paymentMethod: "mock", kind: "renewal" });
    if (!renewal.ok) throw new Error("renewal");
    const r = await service.startPayment(renewal.data.id, "mock", "/r");
    if (!r.ok) throw new Error("renewal start");
    gateway.complete(paymentIdFrom(r.data.checkoutUrl), "succeeded");
    await service.verifyOrder(renewal.data.id);

    const secondExpiry = new Date(db.getSubscription("u1").expiresAt!).getTime();
    expect(secondExpiry - firstExpiry).toBeGreaterThan(27 * 86_400_000);
  });
});
