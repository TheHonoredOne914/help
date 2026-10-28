import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildCabinet, resolvedVpnRef } from "../src/lib/cabinet-view";
import { visibleBotPurchases } from "../src/components/cabinet-sections";
import { paymentsReady } from "../src/lib/payments/ready";
import { placeOrder } from "../src/lib/server/billing";
import { assertBootConfig } from "../src/lib/server/profile";
import {
  accountById,
  finishFulfillment,
  fulfillmentOf,
  listOrderPage,
  devMailbox,
  loginTelegramId,
  markOrderPaid,
  requestEmail,
  verifyEmail,
  openStore,
  orderById,
  repairBilling,
  type Store,
} from "../src/lib/server/store";
import { httpAdapter, type HttpVpnConfig } from "../src/lib/vpn/http-adapter";
import { startVpnStand, type VpnStand } from "../src/lib/vpn/stand";
import type { VpnPurchase } from "../src/lib/vpn/adapter";

const saved = new Map<string, string | undefined>();

function useEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function restoreEnv() {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
}

function fresh(): Store {
  const dir = mkdtempSync(join(tmpdir(), "orasaka-v15-"));
  return openStore(join(dir, "site.sqlite"));
}

function orderFor(store: Store, accountId: string, now: number) {
  const order = placeOrder(store, { accountId, planId: "1m", kind: "new", idempotencyKey: randomUUID(), now });
  if ("error" in order) throw new Error(order.error);
  return order;
}

function purchase(extra: Partial<VpnPurchase> & Pick<VpnPurchase, "id">): VpnPurchase {
  return {
    orderId: null,
    amountMinor: 20_000,
    currency: "RUB",
    termMonths: 1,
    paidAt: "2026-10-01T12:00:00.000Z",
    status: "succeeded",
    ...extra,
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const paid = {
  id: "bot_row",
  order_id: null,
  amount_minor: 20_000,
  currency: "RUB",
  term_months: 1,
  paid_at: "2026-10-01T12:00:00.000Z",
  status: "succeeded",
};
const phone = { id: "d1", label: "Телефон", last_active_at: null, online: null };
const subOk = {
  id: "sub_1",
  status: "active",
  expires_at: "2026-12-01T12:00:00.000Z",
  term_months: 1,
  limits: { device_limit: null },
  connection: { url: "stand://sub/u" },
};

describe("v15 review fixes", () => {
  let stand: VpnStand;
  const originalFetch = globalThis.fetch;
  const open: Store[] = [];

  beforeAll(async () => {
    stand = await startVpnStand();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    restoreEnv();
    for (const store of open) {
      try {
        store.close();
      } catch {
        /* closed */
      }
    }
    open.length = 0;
  });

  afterAll(async () => {
    await stand.close();
  });

  function keep(store: Store) {
    open.push(store);
    return store;
  }

  function mock(routes: Record<string, Response | (() => Response)>) {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      const hit = routes[path];
      if (!hit) return json(500, { error: "down" });
      return typeof hit === "function" ? hit() : hit;
    }) as typeof fetch;
  }

  function adapter(): HttpVpnConfig {
    return { baseUrl: "http://127.0.0.1:9", token: "t", timeoutMs: 1000, durationRule: null };
  }

  it("keeps purchases and devices when the subscription is 404", async () => {
    mock({
      "/v1/users/vpn_x/subscription": json(404, { error: "not_found" }),
      "/v1/users/vpn_x/purchases": json(200, { items: [paid], next_cursor: null, prev_cursor: null, boundary: null }),
      "/v1/users/vpn_x/devices": json(200, { limit: null, online: "unknown", items: [phone] }),
    });
    const store = keep(fresh());
    const now = Date.parse("2026-10-21T12:00:00.000Z");
    const login = loginTelegramId(store, { telegramId: "9001", proofHash: randomUUID(), now, vpnDown: false, vpnRef: "vpn_x" });
    if (!login.ok) throw new Error("login");
    const account = accountById(store, login.accountId)!;
    const snap = await httpAdapter(adapter()).readAccount(store, account);
    expect(snap).toMatchObject({ down: false });
    if (snap.down || !snap.user) throw new Error("user dropped");
    expect(snap.user.expiresAt).toBeNull();
    expect(snap.user.subError).toBe(false);
    expect(snap.user.purchases?.map((item) => item.id)).toEqual(["bot_row"]);
    expect(snap.user.devices?.map((item) => item.label)).toEqual(["Телефон"]);
    const view = buildCabinet(store, account, snap, now);
    expect(view.state).toBe("none");
    expect(view.botPurchases?.map((item) => item.amountMinor)).toEqual([20_000]);
    expect(view.devices).toHaveLength(1);
    expect(view.botPurchasesError).toBe(false);
    const looksEmpty = view.orders.length === 0 && (view.botPurchases ?? []).length === 0 && !view.botPurchasesError;
    expect(looksEmpty).toBe(false);
  });

  it("does not turn a failed history into an empty purchase list", async () => {
    mock({
      "/v1/users/vpn_x/subscription": json(404, { error: "not_found" }),
      "/v1/users/vpn_x/purchases": json(503, { error: "down" }),
      "/v1/users/vpn_x/devices": json(200, { limit: null, online: "unknown", items: [phone] }),
    });
    const store = keep(fresh());
    const now = Date.parse("2026-10-21T12:00:00.000Z");
    const login = loginTelegramId(store, { telegramId: "9002", proofHash: randomUUID(), now, vpnDown: false, vpnRef: "vpn_x" });
    if (!login.ok) throw new Error("login");
    const account = accountById(store, login.accountId)!;
    const view = buildCabinet(store, account, await httpAdapter(adapter()).readAccount(store, account), now);
    expect(view.state).toBe("none");
    expect(view.botPurchasesError).toBe(true);
    expect(view.botPurchases).toBeNull();
    expect(view.devices).toHaveLength(1);
    const looksEmpty = view.orders.length === 0 && (view.botPurchases ?? []).length === 0 && !view.botPurchasesError;
    expect(looksEmpty).toBe(false);
  });

  it("fails only the section with a bad date, currency, or limit", async () => {
    const store = keep(fresh());
    const now = Date.parse("2026-10-21T12:00:00.000Z");
    const login = loginTelegramId(store, { telegramId: "9003", proofHash: randomUUID(), now, vpnDown: false, vpnRef: "vpn_x" });
    if (!login.ok) throw new Error("login");
    const account = accountById(store, login.accountId)!;
    const http = httpAdapter(adapter());
    mock({
      "/v1/users/vpn_x/subscription": json(200, { ...subOk, expires_at: "not-a-date" }),
      "/v1/users/vpn_x/purchases": json(200, { items: [paid], next_cursor: null, prev_cursor: null }),
      "/v1/users/vpn_x/devices": json(200, { limit: null, online: "unknown", items: [phone] }),
    });
    const badDate = buildCabinet(store, account, await http.readAccount(store, account), now);
    expect(badDate.state).toBe("unavailable");
    expect(badDate.botPurchases).toHaveLength(1);
    expect(badDate.devices).toHaveLength(1);
    mock({
      "/v1/users/vpn_x/subscription": json(200, subOk),
      "/v1/users/vpn_x/purchases": json(200, { items: [{ ...paid, currency: "USD" }], next_cursor: null, prev_cursor: null }),
      "/v1/users/vpn_x/devices": json(200, { limit: null, online: "unknown", items: [phone] }),
    });
    const badMoney = buildCabinet(store, account, await http.readAccount(store, account), now);
    expect(badMoney.state).toBe("active");
    expect(badMoney.botPurchasesError).toBe(true);
    expect(badMoney.devices).toHaveLength(1);
    mock({
      "/v1/users/vpn_x/subscription": json(200, subOk),
      "/v1/users/vpn_x/purchases": json(200, { items: [paid], next_cursor: null, prev_cursor: null }),
      "/v1/users/vpn_x/devices": json(200, { limit: -1, online: "unknown", items: [phone] }),
    });
    const badLimit = buildCabinet(store, account, await http.readAccount(store, account), now);
    expect(badLimit.devicesError).toBe(true);
    expect(badLimit.botPurchases).toHaveLength(1);
    expect(badLimit.state).toBe("active");
  });

  it("dedupes by the shared order id and pages site orders", () => {
    const rows = visibleBotPurchases(
      ["site_1"],
      [purchase({ id: "bot_other", orderId: "site_1" }), purchase({ id: "site_1", orderId: null })],
    );
    expect(rows.map((item) => item.id)).toEqual(["site_1"]);
    const store = keep(fresh());
    const now = Date.parse("2026-10-21T12:00:00.000Z");
    const login = loginTelegramId(store, { telegramId: "9004", proofHash: randomUUID(), now, vpnDown: false, vpnRef: null });
    if (!login.ok) throw new Error("login");
    const ids = [0, 1, 2].map((step) => orderFor(store, login.accountId, now + step).id);
    const first = listOrderPage(store, login.accountId, null, 2);
    const second = listOrderPage(store, login.accountId, first.next, 2);
    expect(first.rows.map((row) => row.id)).toEqual([ids[2], ids[1]]);
    expect(first.prev).toBeNull();
    expect(second.rows.map((row) => row.id)).toEqual([ids[0]]);
    expect(second.next).toBeNull();
    expect(second.prev).toBe("0");
    expect(first.rows).toHaveLength(2);
  });

  it("pages bot history with the ref found by email, including a missing subscription", async () => {
    const email = "buyer15@example.com";
    const linked = await fetch(`${stand.url}/v1/users`, {
      method: "POST",
      headers: { authorization: `Bearer ${stand.token}`, "content-type": "application/json" },
      body: JSON.stringify({ telegram_id: "1001", email }),
    });
    expect(linked.status).toBe(200);
    const store = keep(fresh());
    const now = Date.now();
    const sent = requestEmail(store, { email, ip: "203.0.113.50", now, secret: "v15-code-secret-value", mode: "dev" });
    if (!sent.ok || !sent.delivered) throw new Error("mail");
    const created = verifyEmail(store, { email, code: devMailbox(store, email)!.code, now, secret: "v15-code-secret-value" });
    if (!created.ok) throw new Error("verify");
    const account = accountById(store, created.accountId)!;
    expect(account.telegram_id).toBeNull();
    expect(account.vpn_user_ref).toBeNull();
    const http = httpAdapter({ baseUrl: stand.url, token: stand.token, timeoutMs: 1000, durationRule: null });
    await fetch(`${stand.url}/control/fault`, {
      method: "POST",
      headers: { authorization: `Bearer ${stand.token}`, "content-type": "application/json" },
      body: JSON.stringify({ fault: "no_subscription", user: "vpn_1001" }),
    });
    const snap = await http.readAccount(store, account);
    if (snap.down || !snap.user) throw new Error("lookup");
    expect(account.vpn_user_ref).toBeNull();
    expect(resolvedVpnRef(account, snap)).toBe("vpn_1001");
    expect(snap.user.expiresAt).toBeNull();
    expect(snap.user.purchases?.map((item) => item.id)).toEqual(["bot_1001_1", "bot_1001_2"]);
    expect(snap.user.devices).toHaveLength(3);
    const page = await http.listPurchases?.(resolvedVpnRef(account, snap)!, "2");
    expect(page?.ok && page.items.map((item) => item.id)).toEqual(["bot_1001_3"]);
    expect(page?.ok && page.prev).toBe("0");
    const view = buildCabinet(store, account, snap, now);
    expect(view.state).toBe("none");
    expect(view.botPurchases).toHaveLength(2);
    await fetch(`${stand.url}/control/fault`, {
      method: "POST",
      headers: { authorization: `Bearer ${stand.token}`, "content-type": "application/json" },
      body: JSON.stringify({ fault: "ok", user: "vpn_1001" }),
    });
  });

  it("rolls back a crash between writes, repairs the torn rows, and survives two processes", async () => {
    const store = keep(fresh());
    const now = Date.now();
    const login = loginTelegramId(store, { telegramId: "9006", proofHash: randomUUID(), now, vpnDown: false, vpnRef: null });
    if (!login.ok) throw new Error("login");
    const order = orderFor(store, login.accountId, now);
    expect(() => markOrderPaid(store, order.id, now, "between")).toThrow(/crash/);
    expect(orderById(store, order.id)?.status).toBe("awaiting_payment");
    expect(fulfillmentOf(store, order.id)).toBeNull();
    expect(markOrderPaid(store, order.id, now)).toBe(false);
    expect(() => finishFulfillment(store, order.id, "vpn_x", now, "between")).toThrow(/crash/);
    expect(orderById(store, order.id)?.status).toBe("paid");
    expect(fulfillmentOf(store, order.id)?.status).toBe("pending");
    store.db.prepare("delete from fulfillment where order_id = ?").run(order.id);
    expect(repairBilling(store, now)).toEqual({ jobs: 1, closed: 0 });
    expect(fulfillmentOf(store, order.id)?.status).toBe("pending");
    finishFulfillment(store, order.id, "vpn_x", now);
    store.db.prepare("update site_order set status = 'paid' where id = ?").run(order.id);
    expect(repairBilling(store, now)).toEqual({ jobs: 0, closed: 1 });
    expect(orderById(store, order.id)?.status).toBe("active");
    expect(accountById(store, login.accountId)?.vpn_user_ref).toBe("vpn_x");

    const path = store.path;
    const second = orderFor(store, login.accountId, now + 1);
    store.close();
    open.pop();
    const [left, right] = await Promise.all([race("mark", path, second.id), race("mark", path, second.id)]);
    expect([left, right].sort()).toEqual(["marked", "marked"]);
    const again = openStore(path);
    expect(orderById(again, second.id)?.status).toBe("paid");
    expect(fulfillmentOf(again, second.id)?.status).toBe("pending");
    again.close();
    const [a, b] = await Promise.all([race("finish", path, second.id, "vpn_y"), race("finish", path, second.id, "vpn_y")]);
    expect([a, b].sort()).toEqual(["finished", "finished"]);
    const done = openStore(path);
    open.push(done);
    expect(orderById(done, second.id)?.status).toBe("active");
    expect(accountById(done, login.accountId)?.vpn_user_ref).toBe("vpn_x");
  });

  it("refuses the test duration rule on public; production rules unlock without flipping to isolated", () => {
    useEnv({
      ORASAKA_PROFILE: "public",
      ORASAKA_DB_PATH: "/tmp/orasaka-v15-guard.sqlite",
      PAYMENTS_READY: "1",
      YOOKASSA_SHOP_ID: "shop",
      YOOKASSA_SECRET_KEY: "secret",
      YOOKASSA_MODE: "test",
      YOOKASSA_API_BASE: "https://api.yookassa.ru/v3",
      VPN_DURATION_RULE: "test-30-day-blocks",
    });
    expect(() => assertBootConfig()).toThrow(/duration/);
    expect(paymentsReady()).toBe(false);
    useEnv({ VPN_DURATION_RULE: "calendar-months" });
    expect(() => assertBootConfig()).not.toThrow();
    expect(paymentsReady()).toBe(true);
    useEnv({ VPN_DURATION_RULE: "fixed-day-blocks" });
    expect(paymentsReady()).toBe(true);
    useEnv({ ORASAKA_PROFILE: "isolated", VPN_DURATION_RULE: undefined });
    expect(paymentsReady()).toBe(false);
    useEnv({ VPN_DURATION_RULE: "test-30-day-blocks", YOOKASSA_API_BASE: "http://127.0.0.1:9/v3", YOOKASSA_LOCAL_STAND: "1" });
    expect(paymentsReady()).toBe(true);
  });
});


function race(op: "mark" | "finish", path: string, orderId: string, ref = ""): Promise<string> {
  const script = join(tmpdir(), `orasaka-race-${process.pid}-${op}-${randomUUID()}.mts`);
  const storeUrl = fileURLToPath(new URL("../src/lib/server/store.ts", import.meta.url));
  writeFileSync(
    script,
    `import { finishFulfillment, markOrderPaid, openStore } from ${JSON.stringify(storeUrl)};
const store = openStore(process.argv[2]);
if (process.argv[4] === "mark") console.log(markOrderPaid(store, process.argv[3], Date.now()) ? "duplicate" : "marked");
else { finishFulfillment(store, process.argv[3], process.argv[5] || "vpn_y", Date.now()); console.log("finished"); }
store.close();
`,
  );
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", "--import", fileURLToPath(new URL("../scripts/register-ts.mjs", import.meta.url)), script, path, orderId, op, ref],
      { cwd: fileURLToPath(new URL("..", import.meta.url)) },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err || out))));
  });
}
