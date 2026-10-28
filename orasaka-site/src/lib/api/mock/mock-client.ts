import "server-only";
import type { OrasakaApiClient, RequestContext } from "../client";
import type { ApiResult, Capabilities, Plan } from "../types";
import type { MockDb } from "./mock-db";

/*
 * MOCK implementation of OrasakaApiClient. Every method below reads or writes
 * the isolated in-memory MockDb; nothing reaches the bot, FastAPI or Remnawave.
 * Responses are tagged `x-orasaka-source: mock` by the BFF and the UI shows a DEMO marker.
 */

const note = "Тестовая фикстура. Сумма-заглушка, не является ценой.";

export const TEST_PLANS: Plan[] = [
  { id: "test-1m", title: "TEST · 1 месяц", durationMonths: 1, prices: [{ amountMinor: 100, currency: "RUB" }], conditions: [note], test: true },
  {
    id: "test-3m",
    title: "TEST · 3 месяца",
    durationMonths: 3,
    prices: [
      { amountMinor: 300, currency: "RUB" },
      { amountMinor: 3, currency: "XTR" },
    ],
    conditions: [note],
    test: true,
  },
  { id: "test-12m", title: "TEST · 12 месяцев", durationMonths: 12, prices: [{ amountMinor: 1200, currency: "RUB" }], conditions: [note], test: true },
];

/** MOCK capabilities: devices and renewal on so the demo can show them; trial/referral stay off. */
export const MOCK_CAPABILITIES: Capabilities = { trial: false, referral: false, devices: true, renewal: true, topUp: false };

export function createMockClient(db: MockDb, opts: { fixtures: boolean }): OrasakaApiClient {
  const user = (ctx: RequestContext) => db.resolveSession(ctx.sessionId);
  const unauthorized = { ok: false, error: "unauthorized" } as const;
  const withUser = <T>(ctx: RequestContext, fn: (userId: string) => ApiResult<T>): Promise<ApiResult<T>> => {
    const id = user(ctx);
    return Promise.resolve(id ? fn(id) : unauthorized);
  };

  return {
    source: "mock",

    auth: {
      /** MOCK: resolves the demo session cookie against MockDb. */
      async getSession(ctx) {
        const id = user(ctx);
        return {
          ok: true,
          data: { authenticated: !!id, user: id ? { id, displayName: "Демо-пользователь" } : null, demoLoginAvailable: true },
        };
      },
      /** MOCK: Telegram login is not simulated; demo uses /api/auth/demo-login instead. */
      async loginWithTelegram() {
        return { ok: false, error: "contract_unverified" };
      },
      /** MOCK: drops the demo session. */
      async logout(ctx) {
        db.deleteSession(ctx.sessionId);
        return { ok: true, data: null };
      },
    },

    plans: {
      /** MOCK: TEST plans only with DEMO_FIXTURES=test, otherwise an empty list («Тарифы уточняются»). */
      async list() {
        return { ok: true, data: { plans: opts.fixtures ? TEST_PLANS : [], capabilities: MOCK_CAPABILITIES } };
      },
    },

    orders: {
      /** MOCK: idempotent order creation with a server-side price snapshot. */
      create: (ctx, input) => withUser(ctx, (id) => db.createOrder(id, { ...input, kind: "new" })),
      /** MOCK: ownership-checked lookup. */
      get: (ctx, orderId) => withUser(ctx, (id) => db.getOrder(id, orderId)),
      /** MOCK: purchase history of the demo user. */
      list: (ctx) => withUser(ctx, (id) => ({ ok: true, data: db.listOrders(id) })),
      /** MOCK: cancels an unpaid order. */
      cancel: (ctx, orderId) => withUser(ctx, (id) => db.cancelOrder(id, orderId)),
    },

    subscription: {
      /** MOCK: subscription derived from fulfilled TEST orders. */
      get: (ctx) => withUser(ctx, (id) => ({ ok: true, data: db.getSubscription(id) })),
      /** MOCK: renewal order; extends from the current expiry after payment. */
      renew: (ctx, input) => withUser(ctx, (id) => db.createOrder(id, { ...input, kind: "renewal" })),
    },

    connection: {
      /** MOCK: example.invalid link, not a real VPN key. */
      getLink: (ctx) => withUser(ctx, (id) => db.getConnection(id)),
    },

    devices: {
      /** MOCK: TEST devices with a TEST limit. */
      list: (ctx) => withUser(ctx, (id) => ({ ok: true, data: db.listDevices(id) })),
      /** MOCK: removes a TEST device. */
      remove: (ctx, deviceId) => withUser(ctx, (id) => db.removeDevice(id, deviceId)),
    },
  };
}
