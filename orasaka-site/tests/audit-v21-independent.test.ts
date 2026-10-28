import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readCryptoConfig, type CryptoInvoice } from "../src/lib/payments/cryptopay-api";
import { confirmCryptoInvoice, startCryptoPayment } from "../src/lib/payments/cryptopay-flow";
import { placeOrder } from "../src/lib/server/billing";
import { assertBootConfig } from "../src/lib/server/profile";
import { cryptoForOrder, fulfillmentOf, listOrders, openCryptoInvoices, openStore, orderById, type Store } from "../src/lib/server/store";

const config = { token: "local-placeholder", mode: "test" as const, apiBase: "http://127.0.0.1:9/api" };
const saved = new Map<string, string | undefined>();

function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
});

function setup(path = ":memory:") {
  const store = openStore(path);
  const now = 1_800_000_000_000;
  store.db.prepare("insert into site_account (id, created_at) values ('audit', ?)").run(new Date(now).toISOString());
  const order = placeOrder(store, { accountId: "audit", planId: "1m", kind: "new", idempotencyKey: "independent-audit-key-001", now });
  if ("error" in order) throw new Error(order.error);
  return { store, now, order };
}

function jobs(store: Store, orderId: string): number {
  const row = store.db.prepare("select count(*) as n from fulfillment where order_id = ?").get(orderId) as { n: number };
  return row.n;
}

describe("v21 payment defects, fixed", () => {
  it("rolls back a crashed confirm and recovers a split row into one fulfillment", async () => {
    const dir = mkdtempSync(join(tmpdir(), "orasaka-audit-"));
    const path = join(dir, "audit.sqlite");
    const { store, now, order } = setup(path);
    const remotes = new Map<number, CryptoInvoice>();
    let seq = 41;
    const fake: typeof fetch = async (input, init) => {
      const body = JSON.parse(String(init?.body || "{}")) as { amount?: string; payload?: string; invoice_ids?: string };
      if (String(input).endsWith("/createInvoice")) {
        const id = seq;
        seq += 1;
        const remote: CryptoInvoice = {
          invoice_id: id,
          status: "active",
          amount: body.amount ?? "",
          payload: body.payload,
          currency_type: "fiat",
          fiat: "RUB",
          accepted_assets: ["USDT"],
          bot_invoice_url: "https://t.me/CryptoBot?start=IVaudit",
        };
        remotes.set(id, remote);
        return Response.json({ ok: true, result: remote });
      }
      const hit = remotes.get(Number(body.invoice_ids));
      return Response.json({ ok: true, result: { items: hit ? [hit] : [] } });
    };
    const markPaid = (id: number) => {
      const remote = remotes.get(id);
      if (!remote) throw new Error("missing invoice");
      remote.status = "paid";
      remote.paid_asset = "USDT";
      remote.paid_amount = "2.5";
    };
    await startCryptoPayment(store, { accountId: "audit", orderId: order.id, origin: "http://127.0.0.1:3000", config, now, opts: { fetchImpl: fake } });
    markPaid(41);
    store.db.exec("CREATE TRIGGER audit_fail_paid BEFORE UPDATE OF status ON site_order WHEN NEW.status = 'paid' BEGIN SELECT RAISE(ABORT, 'injected crash'); END");
    await expect(confirmCryptoInvoice(store, config, "41", now, { fetchImpl: fake })).rejects.toThrow("injected crash");
    expect({
      order: orderById(store, order.id)?.status,
      attempt: cryptoForOrder(store, order.id)[0]?.status,
      workerCandidates: openCryptoInvoices(store).length,
      job: fulfillmentOf(store, order.id),
    }).toEqual({ order: "awaiting_payment", attempt: "pending", workerCandidates: 1, job: null });
    store.db.prepare("update site_crypto_invoice set status = 'paid', paid_asset = 'USDT', paid_amount = '2.5' where order_id = ?").run(order.id);
    expect(openCryptoInvoices(store)).toHaveLength(1);
    store.db.exec("DROP TRIGGER audit_fail_paid");
    await confirmCryptoInvoice(store, config, "41", now, { fetchImpl: fake });
    expect(orderById(store, order.id)?.status).toBe("paid");
    expect(cryptoForOrder(store, order.id)[0]?.status).toBe("paid");
    expect(jobs(store, order.id)).toBe(1);
    store.close();
    const restarted = openStore(path);
    await confirmCryptoInvoice(restarted, config, "41", now, { fetchImpl: fake });
    expect(orderById(restarted, order.id)?.status).toBe("paid");
    expect(jobs(restarted, order.id)).toBe(1);
    const renewal = placeOrder(restarted, { accountId: "audit", planId: "1m", kind: "renewal", idempotencyKey: "independent-audit-key-002", now });
    if ("error" in renewal) throw new Error(renewal.error);
    await startCryptoPayment(restarted, { accountId: "audit", orderId: renewal.id, origin: "http://127.0.0.1:3000", config, now, opts: { fetchImpl: fake } });
    markPaid(42);
    await confirmCryptoInvoice(restarted, config, "42", now, { fetchImpl: fake });
    await confirmCryptoInvoice(restarted, config, "42", now, { fetchImpl: fake });
    expect(orderById(restarted, renewal.id)?.status).toBe("paid");
    expect(jobs(restarted, renewal.id)).toBe(1);
    restarted.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not create a second invoice after a lost response, including past the first search page", async () => {
    const { store, now, order } = setup();
    const calls: string[] = [];
    const remotes: CryptoInvoice[] = [];
    const fake: typeof fetch = async (input, init) => {
      const method = String(input).split("/").pop()!;
      calls.push(method);
      const body = JSON.parse(String(init?.body || "{}")) as { amount?: string; payload?: string; offset?: number; status?: string };
      if (method === "createInvoice") {
        const remote: CryptoInvoice = {
          invoice_id: 100 + remotes.length,
          status: "active",
          amount: body.amount ?? "",
          payload: body.payload,
          currency_type: "fiat",
          fiat: "RUB",
          accepted_assets: ["USDT"],
          bot_invoice_url: "https://t.me/CryptoBot?start=IVaudit",
        };
        remotes.push(remote);
        if (remotes.length === 1) throw new DOMException("timeout", "TimeoutError");
        return Response.json({ ok: true, result: remote });
      }
      const offset = Number(body.offset ?? 0);
      if (offset === 0) {
        const decoys = Array.from({ length: 100 }, (_, index) => ({
          invoice_id: 1000 + index,
          status: body.status ?? "active",
          amount: "1.00",
          payload: `other-${body.status}-${index}`,
          currency_type: "fiat",
          fiat: "RUB",
          accepted_assets: ["USDT"],
        }));
        return Response.json({ ok: true, result: { items: decoys } });
      }
      return Response.json({ ok: true, result: { items: remotes.filter((row) => !body.status || row.status === body.status) } });
    };
    const first = await startCryptoPayment(store, { accountId: "audit", orderId: order.id, origin: "http://127.0.0.1:3000", config, now, opts: { fetchImpl: fake } });
    const second = await startCryptoPayment(store, { accountId: "audit", orderId: order.id, origin: "http://127.0.0.1:3000", config, now: now + 21_000, opts: { fetchImpl: fake } });
    expect(first).toMatchObject({ timedOut: true, checkoutUrl: null });
    expect(calls.filter((call) => call === "createInvoice")).toEqual(["createInvoice"]);
    expect(calls.filter((call) => call === "getInvoices").length).toBeGreaterThanOrEqual(2);
    expect(remotes).toHaveLength(1);
    expect(cryptoForOrder(store, order.id)).toHaveLength(1);
    expect(second).toMatchObject({ checkoutUrl: "https://t.me/CryptoBot?start=IVaudit" });
    store.close();
  });

  it("accepts only the official host for the selected mode", () => {
    const keys = ["CRYPTOPAY_ENABLED", "CRYPTOPAY_API_TOKEN", "CRYPTOPAY_MODE", "CRYPTOPAY_API_BASE", "CRYPTOPAY_LOCAL_STAND", "ORASAKA_PROFILE", "ORASAKA_DB_PATH", "MAIL_MODE", "VPN_MODE", "SMTP_INSECURE", "VPN_DURATION_RULE", "TRUST_PROXY"];
    const previous = keys.map((key) => process.env[key]);
    const apply = (mode: string, base: string, extra: Record<string, string | undefined> = {}) => {
      process.env.CRYPTOPAY_ENABLED = "1";
      process.env.CRYPTOPAY_API_TOKEN = "local-placeholder";
      process.env.CRYPTOPAY_MODE = mode;
      process.env.CRYPTOPAY_API_BASE = base;
      delete process.env.CRYPTOPAY_LOCAL_STAND;
      process.env.ORASAKA_PROFILE = "public";
      for (const [key, value] of Object.entries(extra)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      return readCryptoConfig();
    };
    try {
      expect(apply("test", "https://pay.crypt.bot/api")).toBeNull();
      expect(apply("test", "https://evil.example/api")).toBeNull();
      expect(apply("live", "https://testnet-pay.crypt.bot/api")).toBeNull();
      expect(apply("test", "https://testnet-pay.crypt.bot/api")?.apiBase).toBe("https://testnet-pay.crypt.bot/api");
      expect(apply("live", "https://pay.crypt.bot/api")?.apiBase).toBe("https://pay.crypt.bot/api");
      expect(apply("test", "http://127.0.0.1:9/api", { CRYPTOPAY_LOCAL_STAND: "1", ORASAKA_PROFILE: "public" })).toBeNull();
      expect(apply("test", "http://127.0.0.1:9/api", { CRYPTOPAY_LOCAL_STAND: "1", ORASAKA_PROFILE: "isolated" })?.apiBase).toBe("http://127.0.0.1:9/api");
      expect(apply("test", "http://127.0.0.1:9/api", { ORASAKA_PROFILE: "isolated" })).toBeNull();
      setEnv({
        ORASAKA_PROFILE: "public",
        ORASAKA_DB_PATH: "/tmp/orasaka-v22-audit-boot.sqlite",
        CRYPTOPAY_LOCAL_STAND: "1",
        MAIL_MODE: undefined,
        VPN_MODE: undefined,
        SMTP_INSECURE: undefined,
        VPN_DURATION_RULE: undefined,
        TRUST_PROXY: undefined,
      });
      expect(() => assertBootConfig()).toThrow(/CRYPTOPAY_LOCAL_STAND/);
    } finally {
      keys.forEach((key, index) => {
        if (previous[index] === undefined) delete process.env[key];
        else process.env[key] = previous[index];
      });
    }
  });

  it("shows a confirmed crypto payment in order history", async () => {
    const dir = mkdtempSync(join(tmpdir(), "orasaka-audit-hist-"));
    const path = join(dir, "hist.sqlite");
    const { store, now, order } = setup(path);
    let remote: CryptoInvoice = { invoice_id: 51, status: "active", amount: "200.00" };
    const fake: typeof fetch = async (input, init) => {
      const body = JSON.parse(String(init?.body || "{}")) as { amount?: string; payload?: string };
      if (String(input).endsWith("/createInvoice")) {
        remote = {
          invoice_id: 51,
          status: "active",
          amount: body.amount ?? "",
          payload: body.payload,
          currency_type: "fiat",
          fiat: "RUB",
          accepted_assets: ["USDT"],
          bot_invoice_url: "https://t.me/CryptoBot?start=IVaudit",
        };
        return Response.json({ ok: true, result: remote });
      }
      return Response.json({ ok: true, result: { items: [remote] } });
    };
    await startCryptoPayment(store, { accountId: "audit", orderId: order.id, origin: "http://127.0.0.1:3000", config, now, opts: { fetchImpl: fake } });
    remote = { ...remote, status: "paid", paid_asset: "USDT", paid_amount: "2.5" };
    await confirmCryptoInvoice(store, config, "51", now, { fetchImpl: fake });
    const history = listOrders(store, "audit")[0];
    const detail = orderById(store, order.id);
    expect(history?.status).toBe("paid");
    expect(history?.payment_status).toBe("succeeded");
    expect(history?.payment_provider).toBe("cryptopay");
    expect(history?.paid_usdt).toBe("2.5");
    expect(history?.amount_minor).toBe(20_000);
    expect(history?.currency).toBe("RUB");
    expect(detail?.payment_status).toBe("succeeded");
    expect(detail?.paid_usdt).toBe("2.5");
    expect(cryptoForOrder(store, order.id)[0]?.status).toBe("paid");
    store.close();
    const restarted = openStore(path);
    const again = listOrders(restarted, "audit")[0];
    expect(again?.payment_status).toBe("succeeded");
    expect(again?.payment_provider).toBe("cryptopay");
    expect(again?.paid_usdt).toBe("2.5");
    expect(orderById(restarted, order.id)?.amount_minor).toBe(20_000);
    restarted.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
