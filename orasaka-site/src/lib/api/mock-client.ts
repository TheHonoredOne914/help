import "server-only";
import type { DemoScenario, OrasakaApiClient, RequestContext } from "./client";
import { MockOrderStore } from "./mock-store";
import type { Account, ApiResult, Capabilities, Order, Plan } from "./types";

export const DEMO_USER_ID = "demo-user";

const TEST_PLANS: Plan[] = [
  {
    id: "test-1m",
    title: "TEST · 1 месяц",
    durationMonths: 1,
    prices: [{ amountMinor: 100_00, currency: "RUB" }],
    conditions: ["Тестовая фикстура, не является предложением"],
    test: true,
  },
  {
    id: "test-3m",
    title: "TEST · 3 месяца",
    durationMonths: 3,
    prices: [
      { amountMinor: 250_00, currency: "RUB" },
      { amountMinor: 150, currency: "XTR" },
    ],
    conditions: ["Тестовая фикстура, не является предложением"],
    test: true,
  },
];

// Every capability stays off until the backend reports it.
const CAPABILITIES: Capabilities = { trial: false, referral: false, devices: false, topUp: false };

const PROVISIONING_DELAY_MS = 4000;

type MockGlobals = { store: MockOrderStore; readyAt: Map<string, number> };
const g = globalThis as typeof globalThis & { __orasakaMock?: MockGlobals };

export function createMockClient(opts: { fixtures: boolean }): OrasakaApiClient & {
  simulatePayment(ctx: RequestContext, orderId: string): ApiResult<Order>;
} {
  const plans = () => (opts.fixtures ? TEST_PLANS : []);
  g.__orasakaMock ??= { store: new MockOrderStore(plans), readyAt: new Map() };
  const { store, readyAt } = g.__orasakaMock;

  const tick = (orderId: string) => {
    const at = readyAt.get(orderId);
    if (at && Date.now() >= at && store.fulfil(orderId)) readyAt.delete(orderId);
  };

  return {
    async listPlans() {
      return { ok: true, data: { plans: plans(), capabilities: CAPABILITIES } };
    },

    async getAccount(ctx) {
      const scenario: DemoScenario = ctx.demoScenario ?? "unauthorized";
      if (scenario === "unauthorized" || !ctx.userId) return { ok: false, error: "unauthorized" };
      if (scenario === "error") return { ok: false, error: "unavailable" };
      return { ok: true, data: demoAccount(scenario) };
    },

    async createOrder(ctx, { planId, idempotencyKey }) {
      if (!ctx.userId) return { ok: false, error: "unauthorized" };
      return store.create(ctx.userId, planId, idempotencyKey);
    },

    async getOrder(ctx, orderId) {
      if (!ctx.userId) return { ok: false, error: "unauthorized" };
      tick(orderId);
      return store.get(ctx.userId, orderId);
    },

    async cancelOrder(ctx, orderId) {
      if (!ctx.userId) return { ok: false, error: "unauthorized" };
      return store.cancel(ctx.userId, orderId);
    },

    simulatePayment(ctx, orderId) {
      if (!ctx.userId) return { ok: false, error: "unauthorized" };
      const found = store.get(ctx.userId, orderId);
      if (!found.ok) return found;
      if (found.data.status !== "awaiting_payment") return found;
      store.applyEvent(orderId, "paid");
      readyAt.set(orderId, Date.now() + PROVISIONING_DELAY_MS);
      return store.get(ctx.userId, orderId);
    },
  };
}

function demoAccount(scenario: Exclude<DemoScenario, "unauthorized" | "error">): Account {
  const now = Date.now();
  const day = 86_400_000;
  const order = (status: Order["status"], offsetDays: number): Order => ({
    id: `test-order-${status}`,
    planId: "test-1m",
    planTitle: "TEST · 1 месяц",
    amount: { amountMinor: 100_00, currency: "RUB" },
    status,
    createdAt: new Date(now - offsetDays * day).toISOString(),
    expiresAt: null,
    test: true,
  });

  const base: Account = {
    user: { displayName: "Демо-пользователь" },
    subscription: { status: "none", expiresAt: null },
    provisioning: "none",
    connection: null,
    devices: null,
    orders: [],
    test: true,
  };

  switch (scenario) {
    case "active":
      return {
        ...base,
        subscription: { status: "active", expiresAt: new Date(now + 27 * day).toISOString() },
        provisioning: "ready",
        connection: { url: "https://example.invalid/sub/TEST-0000-demo-not-a-real-key" },
        orders: [order("active", 3)],
      };
    case "provisioning":
      return { ...base, provisioning: "pending", orders: [order("provisioning_pending", 0)] };
    case "unpaid":
      return { ...base, orders: [order("awaiting_payment", 0)] };
    case "none":
      return base;
  }
}
