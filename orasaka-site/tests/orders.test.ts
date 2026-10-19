import { describe, expect, it } from "vitest";
import { MockDb } from "../src/lib/api/mock/mock-db";
import type { Plan } from "../src/lib/api/types";
import { applyOrderStatus } from "../src/lib/order-status";

const plans: Plan[] = [
  { id: "p1", title: "TEST 1", durationMonths: 1, prices: [{ amountMinor: 100, currency: "RUB" }], conditions: [], test: true },
  { id: "p2", title: "TEST 2", durationMonths: 3, prices: [{ amountMinor: 300, currency: "RUB" }], conditions: [], test: true },
];

const newDb = () => new MockDb(() => plans, { provisioningDelayMs: 0 });
const input = (key: string, planId = "p1") => ({ planId, idempotencyKey: key, paymentMethod: "mock", kind: "new" as const });

describe("order status transitions", () => {
  it("never rolls a final or later state back", () => {
    expect(applyOrderStatus("active", "awaiting_payment")).toBe("active");
    expect(applyOrderStatus("provisioning_pending", "paid")).toBe("provisioning_pending");
    expect(applyOrderStatus("cancelled", "paid")).toBe("cancelled");
    expect(applyOrderStatus("awaiting_payment", "paid")).toBe("paid");
  });

  it("keeps paid distinct from active", () => {
    expect(applyOrderStatus("paid", "provisioning_pending")).toBe("provisioning_pending");
    expect(applyOrderStatus("provisioning_pending", "active")).toBe("active");
  });
});

describe("MockDb orders", () => {
  it("returns the same order for a repeated idempotency key", () => {
    const db = newDb();
    const a = db.createOrder("u1", input("k-1"));
    const b = db.createOrder("u1", input("k-1"));
    expect(a.ok && b.ok && a.data.id === b.data.id).toBe(true);
    expect(db.listOrders("u1")).toHaveLength(1);
  });

  it("rejects a reused key with a different plan", () => {
    const db = newDb();
    db.createOrder("u1", input("k-1"));
    expect(db.createOrder("u1", input("k-1", "p2"))).toEqual({ ok: false, error: "conflict" });
  });

  it("scopes idempotency keys per user", () => {
    const db = newDb();
    const a = db.createOrder("u1", input("k-1"));
    const b = db.createOrder("u2", input("k-1"));
    expect(a.ok && b.ok && a.data.id !== b.data.id).toBe(true);
  });

  it("snapshots the server price and rejects unknown plans", () => {
    const db = newDb();
    const a = db.createOrder("u1", input("k-1", "p2"));
    expect(a.ok && a.data.amount).toEqual({ amountMinor: 300, currency: "RUB" });
    expect(db.createOrder("u1", input("k-2", "nope"))).toEqual({ ok: false, error: "not_found" });
  });

  it("hides other users' orders", () => {
    const db = newDb();
    const a = db.createOrder("u1", input("k-1"));
    if (!a.ok) throw new Error("setup");
    expect(db.getOrder("u2", a.data.id)).toEqual({ ok: false, error: "not_found" });
    expect(db.cancelOrder("u2", a.data.id)).toEqual({ ok: false, error: "not_found" });
  });

  it("refuses renewal without a subscription", () => {
    const db = newDb();
    expect(db.createOrder("u1", { ...input("k-1"), kind: "renewal" })).toEqual({ ok: false, error: "conflict" });
  });

  it("expires unpaid orders", () => {
    const db = newDb();
    const a = db.createOrder("u1", input("k-1"));
    if (!a.ok) throw new Error("setup");
    const later = new Date(Date.now() + 31 * 60_000);
    const got = db.getOrder("u1", a.data.id, later);
    expect(got.ok && got.data.status).toBe("expired");
  });

  it("cancelling grants nothing", () => {
    const db = newDb();
    const a = db.createOrder("u1", input("k-1"));
    if (!a.ok) throw new Error("setup");
    const c = db.cancelOrder("u1", a.data.id);
    expect(c.ok && c.data.status).toBe("cancelled");
    expect(db.getSubscription("u1").status).toBe("none");
  });

  it("fulfils an order exactly once", () => {
    const db = newDb();
    const a = db.createOrder("u1", input("k-1"));
    if (!a.ok) throw new Error("setup");
    db.applyOrderStatus(a.data.id, "paid");
    expect(db.fulfil(a.data.id)).toBe(true);
    expect(db.fulfil(a.data.id)).toBe(false);
    expect(db.getSubscription("u1").status).toBe("active");
  });
});
