import { createHash, createHmac, randomUUID } from "node:crypto";
import { createServer as createHttp, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { mintDoubleProof } from "../src/lib/auth/telegram";
import { CABINET_COPY, buildCabinet, formatExpiry, remainingLabel } from "../src/lib/cabinet-view";
import { ingestNotification, placeOrder, returnUrlFor, runFulfillment, startPayment } from "../src/lib/server/billing";
import { setSessionCookie } from "../src/lib/server/bff";
import { resetStoreForTests } from "../src/lib/server/db";
import { SCHEMA_SQL } from "../src/lib/server/schema";
import {
  accountById,
  createSession,
  devMailbox,
  fulfillmentOf,
  linkEmail,
  linkTelegram,
  listOrders,
  loginWithProof,
  openStore,
  orderForAccount,
  paymentByOrder,
  readSession,
  requestEmail,
  revokeSession,
  unlinkEmail,
  unlinkTelegram,
  verifyEmail,
  type Store,
} from "../src/lib/server/store";
import { countDoubleGrants, countDoubleUsers, doubleAdapter, doubleIsDown, seedDouble, setDoubleDown, unconfiguredAdapter } from "../src/lib/vpn/adapter";
import type { YooConfig } from "../src/lib/payments/yookassa-api";
import { POST as requestRoute } from "../src/app/api/auth/email/request/route";

const SECRET = "test-code-secret-32chars!!";
const DOUBLE = "test-double-secret-32chars!";
const DAY = 24 * 60 * 60 * 1000;
const register = fileURLToPath(new URL("../scripts/register-ts.mjs", import.meta.url));

function fresh(): Store {
  const dir = mkdtempSync(join(tmpdir(), "orasaka-"));
  return openStore(join(dir, "site.sqlite"));
}

function worker(name: string, data: unknown): Promise<{ ok: boolean; error?: string; accountId?: string; created?: boolean }> {
  return new Promise((resolve, reject) => {
    const child = new Worker(new URL(`./workers/${name}.mts`, import.meta.url), {
      execArgv: ["--experimental-strip-types", "--import", register],
      workerData: data,
    });
    child.once("message", (message) => resolve(message as { ok: boolean }));
    child.once("error", reject);
  });
}

function inbox(store: Store, email: string, now: number, ip = "203.0.113.8") {
  const sent = requestEmail(store, { email, ip, now, secret: SECRET, mode: "dev" });
  expect(sent.ok && sent.delivered).toBe(true);
  const box = devMailbox(store, email);
  expect(box?.code).toMatch(/^\d{6}$/);
  return box!.code;
}

type Remote = {
  id: string;
  status: string;
  test: boolean;
  amount: { value: string; currency: string };
  metadata: { orderId: string };
  recipient: { account_id: string };
  confirmation: { confirmation_url: string };
};

function yooStandIn(shopId: string) {
  const byKey = new Map<string, Remote>();
  const byId = new Map<string, Remote>();
  const keys: string[] = [];
  let hang = false;
  const patch = new Map<string, Partial<Remote>>();
  const server = createHttp((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => {
      const key = req.headers["idempotence-key"];
      if (typeof key === "string") keys.push(key);
      expect(String(req.headers.authorization ?? "")).toMatch(/^Basic /);
      if (hang) return;
      const url = req.url ?? "";
      if (req.method === "POST" && url.endsWith("/payments")) {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { amount: Remote["amount"]; metadata: { orderId: string } };
        const existing = byKey.get(String(key));
        const payment: Remote = existing ?? {
          id: `pay_${randomUUID()}`,
          status: "pending",
          test: true,
          amount: body.amount,
          metadata: body.metadata,
          recipient: { account_id: shopId },
          confirmation: { confirmation_url: "https://yookassa.example/pay" },
        };
        byKey.set(String(key), payment);
        byId.set(payment.id, payment);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(payment));
        return;
      }
      const id = url.split("/").pop() ?? "";
      const payment = byId.get(decodeURIComponent(id));
      if (!payment) {
        res.statusCode = 404;
        res.end("{}");
        return;
      }
      const extra = patch.get(payment.id) ?? {};
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ...payment, ...extra, metadata: extra.metadata ?? payment.metadata, amount: extra.amount ?? payment.amount }));
    });
  });
  return {
    keys,
    byId,
    setHang(value: boolean) {
      hang = value;
    },
    patch(id: string, value: Partial<Remote>) {
      patch.set(id, value);
    },
    listen: () =>
      new Promise<YooConfig>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          const port = typeof address === "object" && address ? address.port : 0;
          resolve({ shopId, secretKey: "local-stand-in-secret", mode: "test", apiBase: `http://127.0.0.1:${port}/v3` });
        });
      }),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

describe("v12 acceptance", () => {
  const open: Store[] = [];
  afterEach(() => {
    for (const store of open) {
      try {
        store.close();
      } catch {
        /* already closed */
      }
    }
    open.length = 0;
    resetStoreForTests();
  });

  function useStore() {
    const store = fresh();
    open.push(store);
    return store;
  }

  it("keeps the migration file identical to the schema that openStore applies", () => {
    expect(readFileSync(new URL("../db/001_site_orders.sql", import.meta.url), "utf8")).toBe(SCHEMA_SQL);
  });

  it("normalizes email without stripping dots or plus, and does not reveal whether the account exists", () => {
    const store = useStore();
    expect(requestEmail(store, { email: "  A.B+C@Example.COM ", ip: "198.51.100.2", now: 1, secret: SECRET, mode: "dev" })).toMatchObject({
      ok: true,
      delivered: true,
    });
    expect(devMailbox(store, "a.b+c@example.com")?.code).toMatch(/^\d{6}$/);
    const first = requestEmail(store, { email: "a.b+c@example.com", ip: "198.51.100.3", now: 40_000, secret: SECRET, mode: "dev" });
    const second = requestEmail(store, { email: "new.person@example.com", ip: "198.51.100.4", now: 40_000, secret: SECRET, mode: "dev" });
    expect(JSON.stringify({ ok: first.ok, delivered: first.ok && first.delivered })).toBe(JSON.stringify({ ok: second.ok, delivered: second.ok && second.delivered }));
    const dotted = verifyEmail(store, { email: "a.b+c@example.com", code: devMailbox(store, "a.b+c@example.com")!.code, now: 40_000, secret: SECRET });
    const other = verifyEmail(store, { email: "ab+c@example.com", code: "000000", now: 40_000, secret: SECRET });
    expect(dotted.ok).toBe(true);
    expect(other.ok).toBe(false);
  });

  it("rejects a wrong, expired, replayed and over-attempted code, and opens the same account on the next code", () => {
    const store = useStore();
    const now = Date.now();
    const code = inbox(store, "person@example.com", now);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) verifyEmail(store, { email: "person@example.com", code: wrong, now, secret: SECRET });
    expect(verifyEmail(store, { email: "person@example.com", code, now, secret: SECRET })).toMatchObject({ ok: false, error: "locked" });
    const again = inbox(store, "person@example.com", now + 31_000, "203.0.113.9");
    const first = verifyEmail(store, { email: "person@example.com", code: again, now: now + 31_000, secret: SECRET });
    expect(first).toMatchObject({ ok: true, created: true });
    expect(verifyEmail(store, { email: "person@example.com", code: again, now: now + 31_000, secret: SECRET })).toMatchObject({ ok: false, error: "replay" });
    const third = inbox(store, "person@example.com", now + 70_000, "203.0.113.10");
    const repeat = verifyEmail(store, { email: "person@example.com", code: third, now: now + 70_000, secret: SECRET });
    expect(repeat).toMatchObject({ ok: true, created: false, accountId: first.ok ? first.accountId : "" });
    const stale = requestEmail(store, { email: "late@example.com", ip: "203.0.113.11", now, secret: SECRET, mode: "dev" });
    expect(stale.ok && stale.code).toBeTruthy();
    expect(verifyEmail(store, { email: "late@example.com", code: stale.ok ? stale.code! : "", now: now + 11 * 60 * 1000, secret: SECRET })).toMatchObject({
      ok: false,
      error: "expired",
    });
  });

  it("stops sending after the address, source and resend limits without a different response shape", () => {
    const store = useStore();
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      const sent = requestEmail(store, { email: "limit@example.com", ip: `198.51.100.${i}`, now: now + i * 31_000, secret: SECRET, mode: "dev" });
      expect(sent).toMatchObject({ ok: true, delivered: true });
    }
    const held = devMailbox(store, "limit@example.com")?.code;
    const blocked = requestEmail(store, { email: "limit@example.com", ip: "198.51.100.50", now: now + 6 * 31_000, secret: SECRET, mode: "dev" });
    expect(blocked).toEqual({ ok: true, delivered: false });
    expect(devMailbox(store, "limit@example.com")?.code).toBe(held);
    for (let i = 0; i < 20; i++) {
      expect(requestEmail(store, { email: `u${i}@example.com`, ip: "198.51.100.60", now: now + i * 31_000, secret: SECRET, mode: "dev" }).ok).toBe(true);
    }
    expect(requestEmail(store, { email: "overflow@example.com", ip: "198.51.100.60", now: now + 21 * 31_000, secret: SECRET, mode: "dev" })).toEqual({
      ok: true,
      delivered: false,
    });
    const cooled = requestEmail(store, { email: "cool@example.com", ip: "198.51.100.70", now, secret: SECRET, mode: "dev" });
    expect(cooled).toMatchObject({ delivered: true });
    expect(requestEmail(store, { email: "cool@example.com", ip: "198.51.100.71", now: now + 1000, secret: SECRET, mode: "dev" })).toEqual({ ok: true, delivered: false });
    expect(requestEmail(store, { email: "off@example.com", ip: "198.51.100.80", now, secret: SECRET, mode: "off" })).toEqual({ ok: false, error: "unconfigured" });
    expect(devMailbox(store, "off@example.com")).toBeNull();
  });

  it("consumes one code once when two requests arrive together", async () => {
    const store = useStore();
    const now = Date.now();
    const code = await inbox(store, "race@example.com", now);
    const db = store.path;
    store.close();
    const input = { email: "race@example.com", code, now, secret: SECRET };
    const [left, right] = await Promise.all([worker("verify-email", { db, input }), worker("verify-email", { db, input })]);
    const wins = [left, right].filter((item) => item.ok);
    expect(wins).toHaveLength(1);
    expect(wins[0]?.created).toBe(true);
    const again = openStore(db);
    open.push(again);
    expect(verifyEmail(again, input)).toMatchObject({ ok: false, error: "replay" });
  });

  it("stores only the session hash, revokes it on logout, and refuses another account's order", () => {
    const store = useStore();
    const now = Date.now();
    const code = inbox(store, "owner@example.com", now);
    const account = verifyEmail(store, { email: "owner@example.com", code, now, secret: SECRET });
    expect(account.ok).toBe(true);
    if (!account.ok) return;
    const session = createSession(store, account.accountId, now);
    expect(readSession(store, session.cookie, now)?.id).toBe(account.accountId);
    const raw = store.db.prepare("select id_hash from site_session").get() as { id_hash: string };
    expect(raw.id_hash).not.toBe(session.cookie);
    expect(session.cookie.includes(raw.id_hash)).toBe(false);
    const order = placeOrder(store, { accountId: account.accountId, planId: "3m", kind: "new", idempotencyKey: randomUUID(), now });
    expect("error" in order).toBe(false);
    if ("error" in order) return;
    expect(order.amount_minor).toBe(50_000);
    expect(order.term_months).toBe(3);
    const otherCode = inbox(store, "other@example.com", now + 31_000, "203.0.113.20");
    const other = verifyEmail(store, { email: "other@example.com", code: otherCode, now: now + 31_000, secret: SECRET });
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    expect(orderForAccount(store, other.accountId, order.id)).toBeNull();
    expect(listOrders(store, other.accountId)).toEqual([]);
    expect(JSON.stringify(listOrders(store, account.accountId))).not.toContain("test-double");
    revokeSession(store, session.cookie);
    expect(readSession(store, session.cookie, now)).toBeNull();
    const dbPath = store.path;
    store.close();
    const reopened = openStore(dbPath);
    open.push(reopened);
    expect(orderForAccount(reopened, account.accountId, order.id)?.amount_minor).toBe(50_000);
  });

  it("issues an HttpOnly session cookie and rejects a login request without Origin", async () => {
    const dir = mkdtempSync(join(tmpdir(), "orasaka-http-"));
    process.env.ORASAKA_PROFILE = "isolated";
    process.env.ORASAKA_DB_PATH = join(dir, "site.sqlite");
    process.env.MAIL_MODE = "dev";
    process.env.ORASAKA_CODE_SECRET = SECRET;
    process.env.SITE_MODE = "public";
    delete process.env.SITE_ORIGIN;
    const missing = await requestRoute(new NextRequest("http://127.0.0.1:3100/api/auth/email/request", { method: "POST", headers: { host: "127.0.0.1:3100", "content-type": "application/json" }, body: JSON.stringify({ email: "a@example.com" }) }));
    expect(missing.status).toBe(403);
    const accepted = await requestRoute(
      new NextRequest("http://127.0.0.1:3100/api/auth/email/request", {
        method: "POST",
        headers: { host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100", "content-type": "application/json" },
        body: JSON.stringify({ email: "a@example.com" }),
      }),
    );
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ accepted: true });
    const repeat = await requestRoute(
      new NextRequest("http://127.0.0.1:3100/api/auth/email/request", {
        method: "POST",
        headers: { host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100", "content-type": "application/json" },
        body: JSON.stringify({ email: "known@example.com" }),
      }),
    );
    expect(await repeat.json()).toEqual({ accepted: true });
    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, "session-value", 60, new NextRequest("http://127.0.0.1:3100/"));
    const cookie = res.cookies.get("orasaka_sid");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.secure).toBe(false);
    delete process.env.ORASAKA_PROFILE;
    delete process.env.ORASAKA_DB_PATH;
    delete process.env.MAIL_MODE;
    delete process.env.ORASAKA_CODE_SECRET;
  });

  it("shows an empty cabinet, an active bot subscription, an expired one, and remaining time under a day", () => {
    const store = useStore();
    const now = Date.UTC(2026, 0, 15, 21, 0, 0);
    seedDouble(store, now);
    const emptyCode = inbox(store, "empty@example.com", now);
    const empty = verifyEmail(store, { email: "empty@example.com", code: emptyCode, now, secret: SECRET });
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    const emptyAccount = accountById(store, empty.accountId)!;
    expect(buildCabinet(store, emptyAccount, doubleAdapter().readAccount(store, emptyAccount), now).state).toBe("none");
    const paid = loginWithProof(store, {
      fields: mintDoubleProof(DOUBLE, "1001", "paid_user", now),
      now,
      doubleSecret: DOUBLE,
      botToken: null,
      allowDouble: true,
      vpnDown: false,
      vpnRef: "vpn_double_1001",
    });
    expect(paid.ok).toBe(true);
    if (!paid.ok) return;
    const paidAccount = accountById(store, paid.accountId)!;
    const active = buildCabinet(store, paidAccount, doubleAdapter().readAccount(store, paidAccount), now);
    expect(active.state).toBe("active");
    expect(active.orders).toEqual([]);
    expect(active.connectionUrl).toContain("test-double://");
    expect(active.expiryLabel).toContain("МСК");
    expect(active.remaining).not.toMatch(/^0 /);
    const renamed = loginWithProof(store, {
      fields: mintDoubleProof(DOUBLE, "1001", "renamed_user", now + 1000),
      now: now + 1000,
      doubleSecret: DOUBLE,
      botToken: null,
      allowDouble: true,
      vpnDown: false,
      vpnRef: "vpn_double_1001",
    });
    expect(renamed).toMatchObject({ ok: true, accountId: paid.accountId });
    expect(countDoubleUsers(store)).toBe(2);
    const expiredLogin = loginWithProof(store, {
      fields: mintDoubleProof(DOUBLE, "1002", "expired_user", now),
      now,
      doubleSecret: DOUBLE,
      botToken: null,
      allowDouble: true,
      vpnDown: false,
      vpnRef: "vpn_double_1002",
    });
    expect(expiredLogin.ok).toBe(true);
    if (!expiredLogin.ok) return;
    const expiredAccount = accountById(store, expiredLogin.accountId)!;
    const expired = buildCabinet(store, expiredAccount, doubleAdapter().readAccount(store, expiredAccount), now);
    expect(expired.state).toBe("expired");
    expect(expired.connectionUrl).toBeNull();
    expect(CABINET_COPY.expired).toBe("Подписка истекла");
    store.db.prepare("update double_vpn_user set expires_at = ? where ref = ?").run(new Date(now + 3 * 60 * 60 * 1000).toISOString(), "vpn_double_1001");
    const hours = buildCabinet(store, accountById(store, paid.accountId)!, doubleAdapter().readAccount(store, accountById(store, paid.accountId)!), now);
    expect(hours.remaining).toBe("3 часа");
    expect(hours.remaining).not.toContain("0 дн");
    expect(remainingLabel(new Date(now + 30 * 60 * 1000).toISOString(), now)).toBe("меньше суток");
    expect(formatExpiry(new Date(now).toISOString())).toContain("МСК");
    setDoubleDown(store, true);
    const down = buildCabinet(store, accountById(store, paid.accountId)!, doubleAdapter().readAccount(store, accountById(store, paid.accountId)!), now);
    expect(down.state).toBe("unavailable");
    expect(down.state).not.toBe("none");
    expect(CABINET_COPY.unavailable.startsWith("Состояние подписки временно")).toBe(true);
  });

  it("rejects fake, expired and replayed Telegram proofs and keeps the last login method", () => {
    const store = useStore();
    const now = Date.now();
    seedDouble(store, now);
    const bad = mintDoubleProof(DOUBLE, "1001", "paid_user", now);
    bad.hash = bad.hash.replace(/./, (char) => (char === "a" ? "b" : "a"));
    expect(loginWithProof(store, { fields: bad, now, doubleSecret: DOUBLE, botToken: null, allowDouble: true, vpnDown: false, vpnRef: "vpn_double_1001" }).ok).toBe(false);
    const old = mintDoubleProof(DOUBLE, "1001", "paid_user", now - 20 * 60 * 1000);
    expect(loginWithProof(store, { fields: old, now, doubleSecret: DOUBLE, botToken: null, allowDouble: true, vpnDown: false, vpnRef: null })).toMatchObject({ ok: false, error: "expired" });
    const proof = mintDoubleProof(DOUBLE, "1001", "paid_user", now);
    expect(loginWithProof(store, { fields: proof, now, doubleSecret: DOUBLE, botToken: null, allowDouble: true, vpnDown: false, vpnRef: "vpn_double_1001" }).ok).toBe(true);
    expect(loginWithProof(store, { fields: proof, now: now + 1, doubleSecret: DOUBLE, botToken: null, allowDouble: true, vpnDown: false, vpnRef: "vpn_double_1001" })).toMatchObject({ ok: false, error: "replay" });
    expect(loginWithProof(store, { fields: mintDoubleProof(DOUBLE, "1001", "paid_user", now), now, doubleSecret: DOUBLE, botToken: null, allowDouble: false, vpnDown: false, vpnRef: null })).toMatchObject({ ok: false, error: "bad_proof" });
    const code = inbox(store, "only-email@example.com", now, "203.0.113.30");
    const email = verifyEmail(store, { email: "only-email@example.com", code, now, secret: SECRET });
    expect(email.ok).toBe(true);
    if (!email.ok) return;
    expect(unlinkEmail(store, email.accountId)).toBe("last_method");
    expect(accountById(store, email.accountId)?.email).toBe("only-email@example.com");
    const fields = mintDoubleProof(DOUBLE, "3001", "free_user", now);
    expect(linkTelegram(store, { accountId: email.accountId, fields, now, doubleSecret: DOUBLE, botToken: null, allowDouble: true, vpnRefForTelegram: null }).ok).toBe(true);
    expect(unlinkEmail(store, email.accountId)).toBe("ok");
    expect(unlinkTelegram(store, email.accountId)).toBe("last_method");
    expect(accountById(store, email.accountId)?.telegram_id).toBe("3001");
  });

  it("lets a paid double user link email and an email user link a free Telegram without a second VPN user", () => {
    const store = useStore();
    const now = Date.now();
    seedDouble(store, now);
    const before = countDoubleUsers(store);
    const login = loginWithProof(store, {
      fields: mintDoubleProof(DOUBLE, "1001", "paid_user", now),
      now,
      doubleSecret: DOUBLE,
      botToken: null,
      allowDouble: true,
      vpnDown: false,
      vpnRef: "vpn_double_1001",
    });
    expect(login.ok).toBe(true);
    if (!login.ok) return;
    const code = inbox(store, "paid@example.com", now, "203.0.113.40");
    expect(linkEmail(store, { accountId: login.accountId, email: "paid@example.com", code, now, secret: SECRET }).ok).toBe(true);
    const session = createSession(store, login.accountId, now);
    revokeSession(store, session.cookie);
    const next = inbox(store, "paid@example.com", now + 31_000, "203.0.113.41");
    const again = verifyEmail(store, { email: "paid@example.com", code: next, now: now + 31_000, secret: SECRET });
    expect(again).toMatchObject({ ok: true, created: false, accountId: login.accountId });
    expect(accountById(store, login.accountId)?.vpn_user_ref).toBe("vpn_double_1001");
    const emailCode = inbox(store, "web@example.com", now + 62_000, "203.0.113.42");
    const web = verifyEmail(store, { email: "web@example.com", code: emailCode, now: now + 62_000, secret: SECRET });
    expect(web.ok).toBe(true);
    if (!web.ok) return;
    const proof = mintDoubleProof(DOUBLE, "5550001", "web_user", now);
    expect(linkTelegram(store, { accountId: web.accountId, fields: proof, now, doubleSecret: DOUBLE, botToken: null, allowDouble: true, vpnRefForTelegram: null }).ok).toBe(true);
    const relog = loginWithProof(store, {
      fields: mintDoubleProof(DOUBLE, "5550001", "web_user_renamed", now + 1000),
      now: now + 1000,
      doubleSecret: DOUBLE,
      botToken: null,
      allowDouble: true,
      vpnDown: false,
      vpnRef: null,
    });
    expect(relog).toMatchObject({ ok: true, accountId: web.accountId });
    expect(countDoubleUsers(store)).toBe(before);
    store.db.prepare("update site_account set vpn_user_ref = ? where id = ?").run("vpn_double_a", login.accountId);
    store.db.prepare("update site_account set vpn_user_ref = ? where id = ?").run("vpn_double_b", web.accountId);
    const clash = mintDoubleProof(DOUBLE, "5550001", "web_user", now + 2000);
    expect(linkTelegram(store, { accountId: login.accountId, fields: clash, now: now + 2000, doubleSecret: DOUBLE, botToken: null, allowDouble: true, vpnRefForTelegram: "vpn_double_b" })).toMatchObject({ ok: false, error: "conflict" });
    const mail = inbox(store, "paid@example.com", now + 100_000, "203.0.113.43");
    expect(linkEmail(store, { accountId: web.accountId, email: "paid@example.com", code: mail, now: now + 100_000, secret: SECRET })).toMatchObject({ ok: false, error: "conflict" });
    expect(accountById(store, login.accountId)?.vpn_user_ref).toBe("vpn_double_a");
    expect(accountById(store, web.accountId)?.vpn_user_ref).toBe("vpn_double_b");
  });

  it("does not duplicate a Telegram link when two requests race", async () => {
    const store = useStore();
    const now = Date.now();
    const leftCode = inbox(store, "left@example.com", now, "203.0.113.50");
    const rightCode = inbox(store, "right@example.com", now, "203.0.113.51");
    const left = verifyEmail(store, { email: "left@example.com", code: leftCode, now, secret: SECRET });
    const right = verifyEmail(store, { email: "right@example.com", code: rightCode, now, secret: SECRET });
    expect(left.ok && right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    const db = store.path;
    const fieldsA = mintDoubleProof(DOUBLE, "4242", "same", now);
    const fieldsB = mintDoubleProof(DOUBLE, "4242", "same", now);
    store.close();
    const base = { now, doubleSecret: DOUBLE, botToken: null, allowDouble: true, vpnRefForTelegram: null };
    const [a, b] = await Promise.all([
      worker("link-telegram", { db, input: { ...base, accountId: left.accountId, fields: fieldsA } }),
      worker("link-telegram", { db, input: { ...base, accountId: right.accountId, fields: fieldsB } }),
    ]);
    expect([a, b].filter((item) => item.ok)).toHaveLength(1);
    expect([a, b].filter((item) => !item.ok && item.error === "conflict")).toHaveLength(1);
    const again = openStore(db);
    open.push(again);
    const owners = again.db.prepare("select id from site_account where telegram_id = ?").all("4242") as { id: string }[];
    expect(owners).toHaveLength(1);
    expect(countDoubleUsers(again)).toBe(0);
  });

  it("does not create an account or a VPN user when the double is down", () => {
    const store = useStore();
    const now = Date.now();
    seedDouble(store, now);
    setDoubleDown(store, true);
    expect(doubleIsDown(store)).toBe(true);
    const before = countDoubleUsers(store);
    const result = loginWithProof(store, {
      fields: mintDoubleProof(DOUBLE, "1001", "paid_user", now),
      now,
      doubleSecret: DOUBLE,
      botToken: null,
      allowDouble: true,
      vpnDown: true,
      vpnRef: null,
    });
    expect(result).toMatchObject({ ok: false, error: "vpn_unavailable" });
    expect(countDoubleUsers(store)).toBe(before);
    expect(store.db.prepare("select count(*) as n from site_account").get()).toEqual({ n: 0 });
  });

  it("checks an official Telegram hash and ignores username as a key", () => {
    const store = useStore();
    const now = Date.now();
    const token = "999:TEST_TOKEN";
    const fields: Record<string, string> = { id: "77", auth_date: String(Math.floor(now / 1000)), username: "alpha", first_name: "A" };
    const data = Object.keys(fields).sort().map((key) => `${key}=${fields[key]}`).join("\n");
    fields.hash = createHmac("sha256", createHash("sha256").update(token).digest()).update(data).digest("hex");
    const login = loginWithProof(store, { fields, now, doubleSecret: null, botToken: token, allowDouble: false, vpnDown: false, vpnRef: null });
    expect(login.ok).toBe(true);
    if (!login.ok) return;
    const renamed: Record<string, string> = { ...fields, username: "beta" };
    delete renamed.hash;
    const renamedData = Object.keys(renamed).sort().map((key) => `${key}=${renamed[key]}`).join("\n");
    renamed.hash = createHmac("sha256", createHash("sha256").update(token).digest()).update(renamedData).digest("hex");
    const again = loginWithProof(store, { fields: renamed, now: now + 1000, doubleSecret: null, botToken: token, allowDouble: false, vpnDown: false, vpnRef: null });
    expect(again).toMatchObject({ ok: true, accountId: login.accountId });
    const tampered = { ...renamed, username: "gamma" };
    expect(loginWithProof(store, { fields: tampered, now: now + 2000, doubleSecret: null, botToken: token, allowDouble: false, vpnDown: false, vpnRef: null }).ok).toBe(false);
    expect(countDoubleUsers(store)).toBe(0);
  });

  it("reuses the Idempotence-Key after a timeout and rejects a bad, foreign, test-in-live or canceled payment", async () => {
    const store = useStore();
    const now = Date.now();
    const code = inbox(store, "buyer@example.com", now);
    const account = verifyEmail(store, { email: "buyer@example.com", code, now, secret: SECRET });
    expect(account.ok).toBe(true);
    if (!account.ok) return;
    const shop = yooStandIn("shop-local");
    const config = await shop.listen();
    const origin = "http://127.0.0.1:4010";
    const order = placeOrder(store, { accountId: account.accountId, planId: "1m", kind: "new", idempotencyKey: randomUUID(), now });
    expect("error" in order).toBe(false);
    if ("error" in order) return;
    expect(order.amount_minor).toBe(20_000);
    shop.setHang(true);
    const timed = await startPayment(store, { accountId: account.accountId, orderId: order.id, origin, config, now, opts: { timeoutMs: 200 } });
    expect(timed).toMatchObject({ ok: true, timedOut: true });
    const saved = paymentByOrder(store, order.id);
    expect(saved?.idempotency_key).toBe(shop.keys[0]);
    shop.setHang(false);
    const second = await startPayment(store, { accountId: account.accountId, orderId: order.id, origin, config, now, opts: { timeoutMs: 2000 } });
    expect(second.ok).toBe(true);
    expect(shop.keys[1]).toBe(saved?.idempotency_key);
    expect(returnUrlFor(origin, order.id)).toBe(`${origin}/payment/return?orderId=${encodeURIComponent(order.id)}`);
    const remoteId = [...shop.byId.keys()][0];
    shop.patch(remoteId, { amount: { value: "1.00", currency: "RUB" } });
    expect(await ingestNotification(store, config, { object: { id: remoteId } }, now)).toMatchObject({ result: "rejected", reason: "wrong_amount" });
    expect(orderForAccount(store, account.accountId, order.id)?.status).toBe("awaiting_payment");
    shop.patch(remoteId, { amount: { value: "200.00", currency: "RUB" }, metadata: { orderId: "ord_foreign" } });
    expect(await ingestNotification(store, config, { object: { id: remoteId } }, now)).toMatchObject({ result: "rejected", reason: "foreign_order" });
    shop.patch(remoteId, { metadata: { orderId: order.id }, test: true });
    expect(await ingestNotification(store, { ...config, mode: "live" }, { object: { id: remoteId } }, now)).toMatchObject({ result: "rejected", reason: "test_in_live" });
    expect(fulfillmentOf(store, order.id)).toBeNull();
    shop.patch(remoteId, { status: "canceled", test: true });
    expect(await ingestNotification(store, config, { object: { id: remoteId } }, now)).toMatchObject({ result: "canceled" });
    expect(orderForAccount(store, account.accountId, order.id)?.status).toBe("canceled");
    expect(fulfillmentOf(store, order.id)).toBeNull();
    expect((await startPayment(store, { accountId: account.accountId, orderId: order.id, origin: "", config: null, now })).ok).toBe(false);
    await shop.close();
  });

  it("survives a restart between payment and fulfillment, a down VPN, and renews the same subscription once", async () => {
    const dir = mkdtempSync(join(tmpdir(), "orasaka-pay-"));
    const path = join(dir, "site.sqlite");
    const store = openStore(path);
    open.push(store);
    const now = Date.now();
    seedDouble(store, now);
    const login = loginWithProof(store, {
      fields: mintDoubleProof(DOUBLE, "1001", "paid_user", now),
      now,
      doubleSecret: DOUBLE,
      botToken: null,
      allowDouble: true,
      vpnDown: false,
      vpnRef: "vpn_double_1001",
    });
    expect(login.ok).toBe(true);
    if (!login.ok) return;
    const before = Date.parse(buildCabinet(store, accountById(store, login.accountId)!, doubleAdapter().readAccount(store, accountById(store, login.accountId)!), now).expiresAt ?? "");
    const shop = yooStandIn("shop-local");
    const config = await shop.listen();
    const order = placeOrder(store, { accountId: login.accountId, planId: "1m", kind: "renewal", idempotencyKey: randomUUID(), now });
    if ("error" in order) throw new Error(order.error);
    await startPayment(store, { accountId: login.accountId, orderId: order.id, origin: "http://127.0.0.1:4010", config, now });
    const remoteId = [...shop.byId.keys()][0];
    shop.patch(remoteId, { status: "succeeded" });
    expect(await ingestNotification(store, config, { object: { id: remoteId } }, now)).toMatchObject({ result: "paid", duplicate: false });
    expect(fulfillmentOf(store, order.id)?.status).toBe("pending");
    store.close();
    const restarted = openStore(path);
    open.push(restarted);
    expect(fulfillmentOf(restarted, order.id)?.status).toBe("pending");
    const pendingAccount = accountById(restarted, login.accountId)!;
    const stillActive = buildCabinet(restarted, pendingAccount, doubleAdapter().readAccount(restarted, pendingAccount), now);
    expect(stillActive.state).toBe("active");
    expect(stillActive.renewal).toBe("preparing");
    expect(stillActive.expiresAt).toBeTruthy();
    expect(stillActive.connectionUrl).toBeTruthy();
    setDoubleDown(restarted, true);
    expect(await runFulfillment(restarted, doubleAdapter(), now)).toMatchObject({ done: 0, waiting: 1 });
    expect(countDoubleGrants(restarted, order.id)).toBe(0);
    expect(orderForAccount(restarted, login.accountId, order.id)?.status).toBe("paid");
    const preparing = buildCabinet(restarted, accountById(restarted, login.accountId)!, { down: true, reason: "down" }, now);
    expect(preparing.state).toBe("unavailable");
    expect(preparing.renewal).toBe("preparing");
    expect(preparing.state).not.toBe("none");
    setDoubleDown(restarted, false);
    expect((await runFulfillment(restarted, doubleAdapter(), now + 31_000)).done).toBe(1);
    const after = Date.parse(buildCabinet(restarted, accountById(restarted, login.accountId)!, doubleAdapter().readAccount(restarted, accountById(restarted, login.accountId)!), now).expiresAt ?? "");
    expect(after - before).toBe(30 * DAY);
    expect((await runFulfillment(restarted, doubleAdapter(), now + 1000)).done).toBe(0);
    expect(await ingestNotification(restarted, config, { object: { id: remoteId } }, now + 1000)).toMatchObject({ result: "paid", duplicate: true });
    expect(countDoubleGrants(restarted, order.id)).toBe(1);
    const still = Date.parse(buildCabinet(restarted, accountById(restarted, login.accountId)!, doubleAdapter().readAccount(restarted, accountById(restarted, login.accountId)!), now).expiresAt ?? "");
    expect(still).toBe(after);
    const second = placeOrder(restarted, { accountId: login.accountId, planId: "1m", kind: "renewal", idempotencyKey: randomUUID(), now: now + 2000 });
    if ("error" in second) throw new Error(second.error);
    const shop2 = yooStandIn("shop-local");
    const config2 = await shop2.listen();
    await startPayment(restarted, { accountId: login.accountId, orderId: second.id, origin: "http://127.0.0.1:4010", config: config2, now: now + 2000 });
    const remote2 = [...shop2.byId.keys()][0];
    shop2.patch(remote2, { status: "succeeded" });
    await ingestNotification(restarted, config2, { object: { id: remote2 } }, now + 2000);
    expect((await runFulfillment(restarted, doubleAdapter(), now + 2000)).done).toBe(1);
    const renewed = Date.parse(buildCabinet(restarted, accountById(restarted, login.accountId)!, doubleAdapter().readAccount(restarted, accountById(restarted, login.accountId)!), now).expiresAt ?? "");
    expect(renewed - after).toBe(30 * DAY);
    expect(countDoubleUsers(restarted)).toBe(2);
    expect((await runFulfillment(restarted, unconfiguredAdapter(), now + 3000)).done).toBe(0);
    await shop.close();
    await shop2.close();
  });

  it("runs the fulfillment process against the same file", () => {
    const dir = mkdtempSync(join(tmpdir(), "orasaka-proc-"));
    const path = join(dir, "site.sqlite");
    const store = openStore(path);
    const now = Date.now();
    seedDouble(store, now);
    const code = inbox(store, "proc@example.com", now);
    const account = verifyEmail(store, { email: "proc@example.com", code, now, secret: SECRET });
    expect(account.ok).toBe(true);
    if (!account.ok) return;
    const order = placeOrder(store, { accountId: account.accountId, planId: "1m", kind: "new", idempotencyKey: randomUUID(), now });
    if ("error" in order) throw new Error(order.error);
    store.db.prepare("update site_order set status = 'paid' where id = ?").run(order.id);
    store.db.prepare("insert into fulfillment (order_id, status, attempts, updated_at) values (?, 'pending', 0, ?)").run(order.id, new Date(now).toISOString());
    store.close();
    const ran = spawnSync("node", ["--experimental-strip-types", "--import", register, "scripts/fulfill.mts"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: { ...process.env, ORASAKA_PROFILE: "isolated", ORASAKA_DB_PATH: path, VPN_MODE: "double" },
      encoding: "utf8",
    });
    expect(ran.status).toBe(0);
    expect(ran.stdout).toContain("done 1");
    const again = openStore(path);
    open.push(again);
    expect(fulfillmentOf(again, order.id)?.status).toBe("succeeded");
    expect(countDoubleGrants(again, order.id)).toBe(1);
  });

  it("does not keep a plaintext SMTP client", () => {
    const source = readFileSync(new URL("../src/lib/mail/smtp.ts", import.meta.url), "utf8");
    expect(source).not.toContain("net.connect");
    expect(source).toContain("nodemailer");
  });
});
