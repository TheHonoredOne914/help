import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { expect, test } from "./support";

/*
 * BFF guards over real HTTP against the running demo server (DEMO_FIXTURES=test, PAYMENTS_MODE=mock).
 * Only TEST data is involved.
 */

let base = "";
test.beforeAll(({}, info) => {
  base = new URL(String(info.project.use.baseURL)).origin;
});

async function user(): Promise<APIRequestContext> {
  const ctx = await pwRequest.newContext({ baseURL: base, extraHTTPHeaders: { origin: base } });
  const r = await ctx.post("/api/auth/demo-login");
  expect(r.status()).toBe(200);
  return ctx;
}

const key = () => `e2e-${crypto.randomUUID()}`;
const order = (ctx: APIRequestContext, k: string, headers: Record<string, string> = {}) =>
  ctx.post("/api/orders", {
    headers: { "idempotency-key": k, ...headers },
    data: { planId: "test-1m", paymentMethod: "mock" },
  });

test("owner repro: repeat order after demo reset no longer fails", async () => {
  const u = await user();
  const k = key();
  const first = await order(u, k);
  expect(first.status()).toBe(200);
  const firstId = (await first.json()).order.id;

  const again = await order(u, k);
  expect(again.status()).toBe(200);
  expect((await again.json()).order.id).toBe(firstId);

  for (const preset of ["empty", "active", "provisioning"]) {
    expect((await u.post("/api/demo/preset", { data: { preset } })).status()).toBe(200);
    const after = await order(u, k);
    expect(after.status(), `after ${preset}`).toBe(200);
    const body = await after.json();
    expect(body.order.id).not.toBe(firstId);
    expect(body.order.status).toBe("awaiting_payment");
  }
  expect((await u.get(`/api/orders/${firstId}`)).status()).toBe(404);
  await u.dispose();
});

test("reset does not touch another user's orders", async () => {
  const a = await user();
  const b = await user();
  const bOrder = (await (await order(b, key())).json()).order.id;
  await a.post("/api/demo/preset", { data: { preset: "empty" } });
  expect((await b.get(`/api/orders/${bOrder}`)).status()).toBe(200);
  await a.dispose();
  await b.dispose();
});

test.describe("Origin check on mutations", () => {
  const cases: [string, (b: URL) => string | null][] = [
    ["missing", () => null],
    ["null", () => "null"],
    ["malformed", () => "not a url"],
    ["foreign", () => "https://evil.example"],
    ["other scheme", (b) => `https://${b.host}`],
    ["other port", (b) => `${b.protocol}//${b.hostname}:${Number(b.port || 80) + 1}`],
  ];

  test("allowed origin passes", async () => {
    const u = await user();
    expect((await order(u, key())).status()).toBe(200);
    await u.dispose();
  });

  for (const [name, make] of cases) {
    test(`rejects ${name} origin`, async () => {
      const u = await user();
      const origin = make(new URL(base));
      const override: Record<string, string> = origin === null ? {} : { origin };
      const ctx = await pwRequest.newContext({ baseURL: base, storageState: await u.storageState(), extraHTTPHeaders: override });
      for (const [method, path, data] of [
        ["post", "/api/orders", { planId: "test-1m", paymentMethod: "mock" }],
        ["post", "/api/demo/preset", { preset: "empty" }],
        ["post", "/api/auth/demo-login", {}],
        ["post", "/api/auth/logout", {}],
        ["delete", "/api/devices/test-dev-1", undefined],
      ] as const) {
        const r = await ctx[method](path, { data, headers: { "idempotency-key": key(), ...override } });
        expect(r.status(), `${method} ${path}`).toBe(403);
      }
      await ctx.dispose();
      await u.dispose();
    });
  }
});

test("mutations without a session are rejected", async () => {
  const anon = await pwRequest.newContext({ baseURL: base, extraHTTPHeaders: { origin: base } });
  expect((await order(anon, key())).status()).toBe(401);
  expect((await anon.post("/api/demo/preset", { data: { preset: "active" } })).status()).toBe(401);
  expect((await anon.delete("/api/devices/test-dev-1")).status()).toBe(401);
  expect((await anon.post("/api/orders/test-order-x-1", { data: { action: "cancel" } })).status()).toBe(401);
  await anon.dispose();
});

test("another user's order and device are not reachable", async () => {
  const owner = await user();
  const other = await user();
  await owner.post("/api/demo/preset", { data: { preset: "active" } });
  const orders = await (await owner.get("/api/orders")).json();
  const ownerOrder = orders.orders[0].id as string;
  const devices = await (await owner.get("/api/devices")).json();
  const ownerDevice = devices.items[0].id as string;

  expect((await other.get(`/api/orders/${ownerOrder}`)).status()).toBe(404);
  for (const action of ["cancel", "pay", "verify"]) {
    expect((await other.post(`/api/orders/${ownerOrder}`, { data: { action } })).status(), action).toBe(404);
  }
  // other has no device with that id; owner's device stays.
  expect((await other.delete(`/api/devices/${ownerDevice}`)).status()).toBe(404);
  const still = await (await owner.get("/api/devices")).json();
  expect(still.items.map((d: { id: string }) => d.id)).toContain(ownerDevice);
  await owner.dispose();
  await other.dispose();
});
