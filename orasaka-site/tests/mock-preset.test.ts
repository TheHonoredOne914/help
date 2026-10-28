import { describe, expect, it } from "vitest";
import { MockDb } from "../src/lib/api/mock/mock-db";
import type { DemoPreset } from "../src/lib/api/client";
import type { Plan } from "../src/lib/api/types";
import { PaymentService } from "../src/lib/payments/payment-service";
import { createMockProvider, MockGateway } from "../src/lib/payments/providers/mock-provider";
import { createRegistry } from "../src/lib/payments/registry";

const plans: Plan[] = [
  { id: "test-1m", title: "TEST 1", durationMonths: 1, prices: [{ amountMinor: 100, currency: "RUB" }], conditions: [], test: true },
];
const input = (key: string) => ({ planId: "test-1m", idempotencyKey: key, paymentMethod: "mock", kind: "new" as const });

function setup(delay = 0) {
  const db = new MockDb(() => plans, { provisioningDelayMs: delay });
  const gateway = new MockGateway();
  const service = new PaymentService(db, createRegistry([createMockProvider(gateway, true)]));
  return { db, gateway, service };
}

function create(db: MockDb, user: string, key: string) {
  const r = db.createOrder(user, input(key));
  if (!r.ok) throw new Error(`createOrder failed: ${r.error}`);
  return r.data;
}

describe("demo preset reset", () => {
  it("repeat before reset returns the same order", () => {
    const { db } = setup();
    expect(create(db, "u1", "K").id).toBe(create(db, "u1", "K").id);
  });

  for (const preset of ["empty", "active", "provisioning"] as DemoPreset[]) {
    it(`after "${preset}" the old key creates a fresh order instead of failing`, () => {
      const { db } = setup();
      const before = create(db, "u1", "K");
      db.applyPreset("u1", preset);
      const after = db.createOrder("u1", input("K"));
      expect(after.ok).toBe(true);
      if (!after.ok) return;
      expect(after.data.id).not.toBe(before.id);
      expect(after.data.status).toBe("awaiting_payment");
      // The new key binding is stable again.
      expect(create(db, "u1", "K").id).toBe(after.data.id);
      expect(db.getOrder("u1", before.id)).toEqual({ ok: false, error: "not_found" });
    });
  }

  it("leaves other users untouched", () => {
    const { db } = setup();
    const theirs = create(db, "u2", "K");
    create(db, "u1", "K");
    db.applyPreset("u1", "empty");
    expect(create(db, "u2", "K").id).toBe(theirs.id);
    expect(db.listOrders("u2")).toHaveLength(1);
  });

  it("presets produce the documented states", () => {
    const { db } = setup();
    db.applyPreset("u1", "empty");
    expect(db.getSubscription("u1").status).toBe("none");
    expect(db.listOrders("u1")).toHaveLength(0);
    db.applyPreset("u1", "active");
    expect(db.getSubscription("u1").status).toBe("active");
    expect(db.listOrders("u1")[0]?.status).toBe("active");
    db.applyPreset("u1", "provisioning");
    expect(db.getSubscription("u1")).toMatchObject({ status: "none", provisioning: "pending" });
    expect(db.listOrders("u1").map((o) => o.status)).toEqual(["provisioning_pending"]);
  });

  it("a late webhook for a removed order restores nothing", async () => {
    const { db, gateway, service } = setup();
    const order = create(db, "u1", "K");
    const started = await service.startPayment(order.id, "mock", "/r");
    if (!started.ok) throw new Error("start");
    const event = gateway.complete(started.data.checkoutUrl.split("/").pop()!, "succeeded")!;

    db.applyPreset("u1", "empty");
    const res = await service.handleWebhook("mock", event.body, event.headers);
    expect(res.ok).toBe(false);
    expect(db.listOrders("u1")).toHaveLength(0);
    expect(db.getSubscription("u1").status).toBe("none");
    expect(db.findOrder(order.id)).toBeNull();
    expect(db.latestPaymentForOrder(order.id)).toBeNull();
  });

  it("pending provisioning of a removed order never fires", async () => {
    const { db, gateway, service } = setup(10);
    const order = create(db, "u1", "K");
    const started = await service.startPayment(order.id, "mock", "/r");
    if (!started.ok) throw new Error("start");
    const event = gateway.complete(started.data.checkoutUrl.split("/").pop()!, "succeeded")!;
    await service.handleWebhook("mock", event.body, event.headers);
    expect(db.getOrder("u1", order.id)).toMatchObject({ ok: true, data: { status: "provisioning_pending" } });

    db.applyPreset("u1", "empty");
    const later = Date.now() + 60_000;
    expect(db.getSubscription("u1", later).status).toBe("none");
    expect(db.fulfil(order.id, later)).toBe(false);
    expect(db.listOrders("u1")).toHaveLength(0);
  });
});
