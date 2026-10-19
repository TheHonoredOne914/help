import { describe, expect, it } from "vitest";
import { MockOrderStore } from "../src/lib/api/mock-store";
import type { Plan } from "../src/lib/api/types";
import { applyOrderStatus } from "../src/lib/order-status";

const plans: Plan[] = [
  {
    id: "p1",
    title: "TEST",
    durationMonths: 1,
    prices: [{ amountMinor: 10000, currency: "RUB" }],
    conditions: [],
    test: true,
  },
];

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

describe("mock order store", () => {
  it("returns the same order for a repeated idempotency key", () => {
    const store = new MockOrderStore(() => plans);
    const a = store.create("u1", "p1", "key-0000000000000001");
    const b = store.create("u1", "p1", "key-0000000000000001");
    expect(a.ok && b.ok && a.data.id === b.data.id).toBe(true);
  });

  it("rejects key reuse with a different plan", () => {
    const store = new MockOrderStore(() => [...plans, { ...plans[0], id: "p2" }]);
    store.create("u1", "p1", "key-0000000000000002");
    expect(store.create("u1", "p2", "key-0000000000000002")).toEqual({ ok: false, error: "conflict" });
  });

  it("hides other users' orders", () => {
    const store = new MockOrderStore(() => plans);
    const created = store.create("u1", "p1", "key-0000000000000003");
    if (!created.ok) throw new Error("create failed");
    expect(store.get("u2", created.data.id)).toEqual({ ok: false, error: "not_found" });
    expect(store.cancel("u2", created.data.id)).toEqual({ ok: false, error: "not_found" });
  });

  it("fulfils exactly once despite repeated events", () => {
    const store = new MockOrderStore(() => plans);
    const created = store.create("u1", "p1", "key-0000000000000004");
    if (!created.ok) throw new Error("create failed");
    const id = created.data.id;
    store.applyEvent(id, "paid");
    store.applyEvent(id, "paid");
    expect(store.fulfil(id)).toBe(true);
    expect(store.fulfil(id)).toBe(false);
    store.applyEvent(id, "awaiting_payment");
    const after = store.get("u1", id);
    expect(after.ok && after.data.status).toBe("active");
  });

  it("does not grant access after cancellation", () => {
    const store = new MockOrderStore(() => plans);
    const created = store.create("u1", "p1", "key-0000000000000005");
    if (!created.ok) throw new Error("create failed");
    store.cancel("u1", created.data.id);
    store.applyEvent(created.data.id, "paid");
    expect(store.fulfil(created.data.id)).toBe(false);
    const after = store.get("u1", created.data.id);
    expect(after.ok && after.data.status).toBe("cancelled");
  });

  it("uses the server-side price snapshot", () => {
    const store = new MockOrderStore(() => plans);
    const created = store.create("u1", "p1", "key-0000000000000006");
    expect(created.ok && created.data.amount).toEqual({ amountMinor: 10000, currency: "RUB" });
  });
});
