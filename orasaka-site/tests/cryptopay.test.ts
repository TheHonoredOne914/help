import { createServer } from "node:http";
import type { Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { cryptoSignature, payUrlOf } from "../src/lib/payments/cryptopay-api";
import { ingestCryptoWebhook } from "../src/lib/payments/cryptopay-flow";
import { cryptoChargeReady, paymentsReady } from "../src/lib/payments/ready";
import { startSiteCheckout } from "../src/lib/server/public-checkout";
import { cryptoForOrder, fulfillmentOf, openStore, orderById, type Store } from "../src/lib/server/store";
import type { CryptoInvoice } from "../src/lib/payments/cryptopay-api";

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

function account(store: Store): string {
  store.db.prepare("insert into site_account (id, created_at) values ('acc', ?)").run(new Date().toISOString());
  return "acc";
}

function stand() {
  const invoices = new Map<string, CryptoInvoice>();
  let seq = 10;
  const sockets = new Set<Socket>();
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as {
        payload?: string;
        amount?: string;
        invoice_ids?: string;
        status?: string;
      };
      const url = req.url ?? "";
      if (url.endsWith("/createInvoice")) {
        const id = ++seq;
        const invoice: CryptoInvoice = {
          invoice_id: id,
          status: "active",
          amount: body.amount ?? "",
          payload: body.payload,
          currency_type: "fiat",
          fiat: "RUB",
          accepted_assets: ["USDT"],
          bot_invoice_url: `https://t.me/CryptoBot?start=IV${id}`,
        };
        invoices.set(String(id), invoice);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, result: invoice }));
        return;
      }
      if (url.endsWith("/getInvoices")) {
        const items = body.invoice_ids
          ? [invoices.get(body.invoice_ids)].filter(Boolean)
          : [...invoices.values()].filter((row) => !body.status || row.status === body.status);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, result: { items } }));
        return;
      }
      res.statusCode = 404;
      res.end("{}");
    });
  });
  server.on("connection", (socket) => sockets.add(socket));
  return {
    invoices,
    listen: () =>
      new Promise<string>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          if (!address || typeof address === "string") throw new Error("port");
          resolve(`http://127.0.0.1:${address.port}/api`);
        });
      }),
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

describe("crypto pay", () => {
  it("keeps a loopback invoice url and drops a public http url", () => {
    const row = { invoice_id: 1, status: "active", amount: "200.00" };
    expect(payUrlOf({ ...row, bot_invoice_url: "http://127.0.0.1:8791/invoice/1" })).toBe("http://127.0.0.1:8791/invoice/1");
    expect(payUrlOf({ ...row, bot_invoice_url: "http://pay.example/invoice" })).toBeNull();
  });

  it("stays off on the public profile even when a token is present", () => {
    setEnv({
      ORASAKA_PROFILE: "public",
      CRYPTOPAY_ENABLED: "1",
      CRYPTOPAY_API_TOKEN: "stand-token",
      CRYPTOPAY_MODE: "test",
      CRYPTOPAY_API_BASE: "http://127.0.0.1:9/api",
      VPN_DURATION_RULE: "test-30-day-blocks",
    });
    expect(cryptoChargeReady()).toBe(false);
    expect(paymentsReady()).toBe(false);
  });

  it("creates a RUB fiat invoice, grants once, and keeps a second payment for review", async () => {
    const shop = stand();
    const base = await shop.listen();
    setEnv({
      ORASAKA_PROFILE: "isolated",
      VPN_DURATION_RULE: "test-30-day-blocks",
      CRYPTOPAY_ENABLED: "1",
      CRYPTOPAY_API_TOKEN: "stand-token",
      CRYPTOPAY_MODE: "test",
      CRYPTOPAY_API_BASE: base,
      CRYPTOPAY_LOCAL_STAND: "1",
      PAYMENTS_READY: undefined,
      YOOKASSA_SHOP_ID: undefined,
      YOOKASSA_SECRET_KEY: undefined,
      YOOKASSA_MODE: undefined,
    });
    const store = openStore(":memory:");
    const now = Date.now();
    const id = account(store);
    const started = await startSiteCheckout(store, {
      accountId: id,
      planId: "1m",
      idempotencyKey: "order-key-cryptopay-01",
      origin: "http://127.0.0.1:3000",
      now,
      config: null,
      method: "cryptopay",
      crypto: {
        token: "stand-token",
        mode: "test",
        apiBase: base,
      },
    });
    expect(started.ok && started.amountMinor).toBe(20_000);
    if (!started.ok) throw new Error("start");
    const invoice = [...shop.invoices.values()][0];
    expect(invoice.amount).toBe("200.00");
    expect(invoice.fiat).toBe("RUB");
    expect(started.checkoutUrl).toContain("https://t.me/CryptoBot");
    const again = await startSiteCheckout(store, {
      accountId: id,
      planId: "1m",
      idempotencyKey: "order-key-cryptopay-01",
      origin: "http://127.0.0.1:3000",
      now: now + 1000,
      config: null,
      method: "cryptopay",
      crypto: { token: "stand-token", mode: "test", apiBase: base },
    });
    expect(again.ok && again.orderId).toBe(started.orderId);
    expect(shop.invoices.size).toBe(1);

    invoice.status = "paid";
    invoice.paid_asset = "USDT";
    invoice.paid_amount = "2.500000";
    const raw = JSON.stringify({ update_id: 1, update_type: "invoice_paid", payload: invoice });
    const cfg = { token: "stand-token", mode: "test" as const, apiBase: base };
    expect((await ingestCryptoWebhook(store, cfg, raw, "00", now)).result).toBe("rejected");
    expect(orderById(store, started.orderId)?.status).toBe("awaiting_payment");
    const signed = await ingestCryptoWebhook(store, cfg, raw, cryptoSignature(cfg.token, raw), now);
    expect(signed).toEqual({ result: "paid", duplicate: false });
    expect((await ingestCryptoWebhook(store, cfg, raw, cryptoSignature(cfg.token, raw), now)).result).toBe("review");
    expect(fulfillmentOf(store, started.orderId)?.status).toBe("pending");

    const other = await startSiteCheckout(store, {
      accountId: id,
      planId: "3m",
      idempotencyKey: "order-key-cryptopay-02",
      origin: "http://127.0.0.1:3000",
      now,
      config: null,
      method: "cryptopay",
      crypto: cfg,
    });
    if (!other.ok) throw new Error("other");
    const extra = [...shop.invoices.values()].find((row) => row.amount === "500.00");
    if (!extra) throw new Error("extra");
    extra.status = "paid";
    extra.paid_asset = "BTC";
    extra.paid_amount = "0.01";
    const badAsset = JSON.stringify({ update_id: 9, payload: extra });
    expect((await ingestCryptoWebhook(store, cfg, badAsset, cryptoSignature(cfg.token, badAsset), now)).result).toBe("rejected");
    expect(orderById(store, other.orderId)?.status).toBe("awaiting_payment");
    extra.paid_asset = "USDT";
    const good = JSON.stringify({ update_id: 9, payload: extra });
    expect((await ingestCryptoWebhook(store, cfg, good, cryptoSignature(cfg.token, good), now)).result).toBe("paid");
    const rows = cryptoForOrder(store, started.orderId);
    expect(rows.some((row) => row.status === "paid" || row.status === "review")).toBe(true);
    store.close();
    await shop.close();
  });
});
