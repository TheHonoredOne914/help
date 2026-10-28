import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { verifyTelegramIdToken } from "../src/lib/auth/telegram-oidc";
import { buildCabinet } from "../src/lib/cabinet-view";
import { paymentsReady } from "../src/lib/payments/ready";
import type { YooConfig, YooPayment } from "../src/lib/payments/yookassa-api";
import { ingestNotification, placeOrder, reconcileOrder, runFulfillment } from "../src/lib/server/billing";
import { assertBootConfig } from "../src/lib/server/profile";
import { startSiteCheckout } from "../src/lib/server/public-checkout";
import {
  accountById,
  attachVpnRef,
  backupDatabase,
  createSession,
  devMailbox,
  fulfillmentOf,
  linkEmail,
  linkTelegramId,
  loginTelegramId,
  markOrderPaid,
  openStore,
  ownedOrder,
  readSession,
  requestEmail,
  revokeSession,
  verifyEmail,
  type Store,
} from "../src/lib/server/store";
import { countDoubleUsers } from "../src/lib/vpn/adapter";
import { httpAdapter, resolveTelegramVpn, type HttpVpnConfig } from "../src/lib/vpn/http-adapter";
import { startVpnStand, type VpnStand } from "../src/lib/vpn/stand";

const SECRET = "v14-code-secret-value";
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const saved = new Map<string, string | undefined>();

function useEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function yooStand() {
  const shopId = "stand-shop";
  const byId = new Map<string, YooPayment>();
  const sockets = new Set<Socket>();
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => {
      const url = req.url ?? "";
      if (req.method === "POST" && url.endsWith("/payments")) {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { amount: YooPayment["amount"]; metadata: { orderId: string } };
        const payment: YooPayment = {
          id: `pay_${randomUUID()}`,
          status: "pending",
          test: true,
          amount: body.amount,
          metadata: body.metadata,
          recipient: { account_id: shopId },
          confirmation: { confirmation_url: "http://127.0.0.1/local-yoo-stand" },
        };
        byId.set(payment.id, payment);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(payment));
        return;
      }
      const id = decodeURIComponent(url.split("/").pop() ?? "");
      const payment = byId.get(id);
      if (!payment) {
        res.statusCode = 404;
        res.end("{}");
        return;
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(payment));
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  return {
    byId,
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
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

describe("v14 contract stand", () => {
  let stand: VpnStand;
  const open: Store[] = [];

  beforeAll(async () => {
    stand = await startVpnStand();
  });

  afterEach(async () => {
    await fetch(`${stand.url}/control/fault`, {
      method: "POST",
      headers: { authorization: `Bearer ${stand.token}`, "content-type": "application/json" },
      body: JSON.stringify({ fault: "ok", online: "unknown", user: "vpn_1001" }),
    }).catch(() => undefined);
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    saved.clear();
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

  function fresh() {
    const dir = mkdtempSync(join(tmpdir(), "orasaka-v14-"));
    const store = openStore(join(dir, "site.sqlite"));
    open.push(store);
    return store;
  }

  function cfg(durationRule: HttpVpnConfig["durationRule"]): HttpVpnConfig {
    return { baseUrl: stand.url, token: stand.token, timeoutMs: 1000, durationRule };
  }

  async function control(body: Record<string, unknown>) {
    const response = await fetch(`${stand.url}/control/fault`, {
      method: "POST",
      headers: { authorization: `Bearer ${stand.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);
  }

  it("registers from the local mailbox, shows an empty cabinet, and returns the same account", async () => {
    const store = fresh();
    const now = Date.now();
    const sent = requestEmail(store, { email: "New.Person+tag@example.com", ip: "203.0.113.14", now, secret: SECRET, mode: "dev" });
    expect(sent.ok && sent.delivered).toBe(true);
    const code = devMailbox(store, "new.person+tag@example.com")?.code ?? "";
    expect(code).toMatch(/^\d{6}$/);
    const created = verifyEmail(store, { email: "new.person+tag@example.com", code, now, secret: SECRET });
    expect(created.ok && created.created).toBe(true);
    if (!created.ok) return;
    const account = accountById(store, created.accountId);
    if (!account) throw new Error("account");
    const view = buildCabinet(store, account, await httpAdapter(cfg(null)).readAccount(store, account), now);
    expect(view.state).toBe("none");
    expect(view.devices).toEqual([]);
    expect(view.botPurchases).toEqual([]);
    expect(view.connectionUrl).toBeNull();
    const session = createSession(store, created.accountId, now);
    expect(readSession(store, session.cookie, now)?.id).toBe(created.accountId);
    revokeSession(store, session.cookie);
    expect(readSession(store, session.cookie, now)).toBeNull();
    const againAt = now + 40_000;
    const resent = requestEmail(store, { email: "new.person+tag@example.com", ip: "203.0.113.15", now: againAt, secret: SECRET, mode: "dev" });
    expect(resent.ok && resent.delivered).toBe(true);
    const next = verifyEmail(store, {
      email: "new.person+tag@example.com",
      code: devMailbox(store, "new.person+tag@example.com")!.code,
      now: againAt,
      secret: SECRET,
    });
    expect(next.ok && !next.created && next.accountId).toBe(created.accountId);
    expect(verifyEmail(store, { email: "new.person+tag@example.com", code: "000000", now: againAt, secret: SECRET }).ok).toBe(false);
  });

  it("keeps the account, session, and order across a reopen, and restores a backup separately", () => {
    const dir = mkdtempSync(join(tmpdir(), "orasaka-v14-keep-"));
    const path = join(dir, "site.sqlite");
    const store = openStore(path);
    const now = Date.now();
    const sent = requestEmail(store, { email: "keep14@example.com", ip: "203.0.113.16", now, secret: SECRET, mode: "dev" });
    if (!sent.ok || !sent.delivered) throw new Error("mail");
    const created = verifyEmail(store, { email: "keep14@example.com", code: devMailbox(store, "keep14@example.com")!.code, now, secret: SECRET });
    if (!created.ok) throw new Error("verify");
    const session = createSession(store, created.accountId, now);
    const order = startOrder(store, created.accountId, now);
    store.close();
    const reopened = openStore(path);
    open.push(reopened);
    expect(readSession(reopened, session.cookie, now)?.id).toBe(created.accountId);
    expect(ownedOrder(reopened, created.accountId, order.id)?.amount_minor).toBe(20_000);
    const vacuum = join(dir, "vacuum.sqlite");
    backupDatabase(reopened, vacuum);
    rmSync(path);
    const restored = openStore(vacuum);
    open.push(restored);
    expect(accountById(restored, created.accountId)?.email).toBe("keep14@example.com");
    expect(ownedOrder(restored, created.accountId, order.id)?.id).toBe(order.id);
  });

  it("reads the Telegram buyer's subscription, history, and devices over HTTP and links email to that cabinet", async () => {
    const store = fresh();
    const now = Date.now();
    const proof = createHash("sha256").update(`proof-${now}`).digest("hex");
    const login = loginTelegramId(store, { telegramId: "1001", proofHash: proof, now, vpnDown: false, vpnRef: "vpn_1001" });
    expect(login.ok).toBe(true);
    if (!login.ok) return;
    const account = accountById(store, login.accountId);
    if (!account) throw new Error("account");
    const adapter = httpAdapter(cfg("test-30-day-blocks"));
    const snap = await adapter.readAccount(store, account);
    expect(snap.down).toBe(false);
    if (snap.down || !snap.user) throw new Error("snap");
    const view = buildCabinet(store, account, snap, now);
    expect(view.state).toBe("active");
    expect(view.connectionUrl).toBe("stand://sub/vpn_1001");
    expect(view.expiryLabel).toMatch(/МСК$/);
    expect(view.remaining).not.toMatch(/^0 /);
    expect(view.online).toBe("unknown");
    expect(view.devices?.map((device) => device.label)).toEqual(["Телефон", "Ноутбук", "Планшет"]);
    expect(view.deviceLimit).toBeNull();
    expect(view.botPurchases?.map((item) => item.id)).toEqual(["bot_1001_1", "bot_1001_2"]);
    expect(view.purchaseCursor).toBe("2");
    expect(countDoubleUsers(store)).toBe(0);
    await control({ fault: "ok", online: "known", user: "vpn_1001" });
    const known = await adapter.readAccount(store, account);
    if (known.down || !known.user?.devices) throw new Error("known");
    expect(known.user.online).toBe("known");
    expect(known.user.devices.map((device) => device.online)).toEqual([true, false, null]);
    const expiredAccount = loginTelegramId(store, {
      telegramId: "1002",
      proofHash: createHash("sha256").update(`proof-1002-${now}`).digest("hex"),
      now,
      vpnDown: false,
      vpnRef: "vpn_1002",
    });
    if (!expiredAccount.ok) throw new Error("1002");
    const expired = buildCabinet(store, accountById(store, expiredAccount.accountId)!, await adapter.readAccount(store, accountById(store, expiredAccount.accountId)!), now);
    expect(expired.state).toBe("expired");
    expect(expired.botBoundary).toBe("not_stored");
    expect(expired.botPurchases).toEqual([]);
    const mailAt = now + 40_000;
    const sent = requestEmail(store, { email: "buyer14@example.com", ip: "203.0.113.17", now: mailAt, secret: SECRET, mode: "dev" });
    expect(sent.ok && sent.delivered).toBe(true);
    const linked = linkEmail(store, {
      accountId: login.accountId,
      email: "buyer14@example.com",
      code: devMailbox(store, "buyer14@example.com")!.code,
      now: mailAt,
      secret: SECRET,
    });
    expect(linked.ok).toBe(true);
    const mailAgain = mailAt + 40_000;
    requestEmail(store, { email: "buyer14@example.com", ip: "203.0.113.18", now: mailAgain, secret: SECRET, mode: "dev" });
    const viaEmail = verifyEmail(store, {
      email: "buyer14@example.com",
      code: devMailbox(store, "buyer14@example.com")!.code,
      now: mailAgain,
      secret: SECRET,
    });
    expect(viaEmail.ok && viaEmail.accountId).toBe(login.accountId);
    await control({ fault: "ok", online: "unknown", user: "vpn_1001" });
  });

  it("extends a paid order once when the test duration rule is set, and a return URL is not proof", async () => {
    const store = fresh();
    const now = Date.now();
    const login = loginTelegramId(store, {
      telegramId: "1001",
      proofHash: createHash("sha256").update(`pay-${now}`).digest("hex"),
      now,
      vpnDown: false,
      vpnRef: "vpn_1001",
    });
    if (!login.ok) throw new Error("login");
    const account = accountById(store, login.accountId)!;
    const adapter = httpAdapter(cfg("test-30-day-blocks"));
    const before = await adapter.readAccount(store, account);
    if (before.down || !before.user?.expiresAt) throw new Error("before");
    const shop = yooStand();
    const config = await shop.listen();
    useEnv({
      ORASAKA_PROFILE: "isolated",
      VPN_DURATION_RULE: "test-30-day-blocks",
      PAYMENTS_READY: "1",
      YOOKASSA_SHOP_ID: config.shopId,
      YOOKASSA_SECRET_KEY: config.secretKey,
      YOOKASSA_MODE: "test",
      YOOKASSA_API_BASE: config.apiBase,
      YOOKASSA_LOCAL_STAND: "1",
    });
    expect(paymentsReady()).toBe(true);
    const started = await startSiteCheckout(store, {
      accountId: account.id,
      planId: "1m",
      idempotencyKey: randomUUID(),
      origin: "http://127.0.0.1:3000",
      now,
      config,
    });
    expect(started.ok && started.amountMinor).toBe(20_000);
    if (!started.ok) throw new Error("checkout");
    const remote = [...shop.byId.values()][0];
    expect(remote.amount.value).toBe("200.00");
    expect(await reconcileOrder(store, config, started.orderId, account.id, now)).toMatchObject({ result: "pending" });
    expect(ownedOrder(store, account.id, started.orderId)?.status).toBe("awaiting_payment");
    remote.status = "succeeded";
    expect((await ingestNotification(store, config, { object: { id: remote.id } }, now)).result).toBe("paid");
    const [first, second] = await Promise.all([
      runFulfillment(store, adapter, now),
      runFulfillment(store, adapter, now),
    ]);
    expect(first.done + second.done).toBeGreaterThan(0);
    const after = await adapter.readAccount(store, account);
    if (after.down || !after.user?.expiresAt) throw new Error("after");
    expect(Date.parse(after.user.expiresAt) - Date.parse(before.user.expiresAt)).toBe(MONTH_MS);
    const replay = await ingestNotification(store, config, { object: { id: remote.id } }, now + 1);
    expect(replay.result === "paid" && replay.duplicate).toBe(true);
    expect((await runFulfillment(store, adapter, now + 1)).done).toBe(0);
    const still = await adapter.readAccount(store, account);
    if (still.down || !still.user?.expiresAt) throw new Error("still");
    expect(still.user.expiresAt).toBe(after.user.expiresAt);
    const pendingOrder = startOrder(store, account.id, now + 2);
    const pending = markOrderPaid(store, pendingOrder.id, now + 2);
    expect(pending).toBe(false);
    const hidden = buildCabinet(store, accountById(store, account.id)!, still, now + 2);
    expect(hidden.state).toBe("active");
    expect(hidden.renewal).toBe("preparing");
    expect(hidden.connectionUrl).toBe("stand://sub/vpn_1001");
    expect(await runFulfillment(store, httpAdapter(cfg(null)), now + 2)).toEqual({ done: 0, waiting: 0 });
    expect(fulfillmentOf(store, pendingOrder.id)?.status).toBe("failed");
    expect(fulfillmentOf(store, pendingOrder.id)?.last_error).toBe("duration_unconfigured");
    expect((await adapter.readAccount(store, account)).down).toBe(false);
    const untouched = await adapter.readAccount(store, account);
    if (untouched.down || !untouched.user?.expiresAt) throw new Error("untouched");
    expect(untouched.user.expiresAt).toBe(after.user.expiresAt);
    expect(fulfillmentOf(store, ownedOrder(store, account.id, started.orderId)!.id)?.status).toBe("succeeded");
    await shop.close();
  });

  it("reports down, timeout, garbage, an empty list, and an account conflict without inventing rows", async () => {
    const store = fresh();
    const now = Date.now();
    const login = loginTelegramId(store, {
      telegramId: "1001",
      proofHash: createHash("sha256").update(`fault-${now}`).digest("hex"),
      now,
      vpnDown: false,
      vpnRef: "vpn_1001",
    });
    if (!login.ok) throw new Error("login");
    const account = accountById(store, login.accountId)!;
    const adapter = httpAdapter(cfg(null));
    await control({ fault: "down" });
    expect(await adapter.readAccount(store, account)).toMatchObject({ down: true, reason: "down" });
    expect(buildCabinet(store, account, await adapter.readAccount(store, account), now).connectionUrl).toBeNull();
    await control({ fault: "timeout" });
    expect(await httpAdapter({ ...cfg(null), timeoutMs: 300 }).readAccount(store, account)).toMatchObject({ down: true, reason: "timeout" });
    await control({ fault: "garbage" });
    expect(await adapter.readAccount(store, account)).toMatchObject({ down: true, reason: "bad_response" });
    await control({ fault: "empty" });
    const empty = await adapter.readAccount(store, account);
    if (empty.down || !empty.user) throw new Error("empty");
    expect(empty.user.expiresAt).toBeTruthy();
    expect(empty.user.devices).toEqual([]);
    expect(empty.user.online).toBe("unknown");
    expect(empty.user.purchases).toEqual([]);
    await control({ fault: "purchases_down" });
    const partial = await adapter.readAccount(store, account);
    if (partial.down || !partial.user) throw new Error("partial");
    expect(partial.user.subError).toBe(false);
    expect(partial.user.purchasesError).toBe(true);
    expect(partial.user.devices?.length).toBe(3);
    const siteOrder = startOrder(store, account.id, now);
    const view = buildCabinet(store, account, partial, now);
    expect(view.orders.some((order) => order.id === siteOrder.id)).toBe(true);
    expect(view.botPurchasesError).toBe(true);
    await control({ fault: "ok" });
    const other = verifyEmail(store, { email: "other14@example.com", code: "000000", now, secret: SECRET });
    expect(other.ok).toBe(false);
    const sent = requestEmail(store, { email: "other14@example.com", ip: "203.0.113.19", now: now + 40_000, secret: SECRET, mode: "dev" });
    expect(sent.ok && sent.delivered).toBe(true);
    const second = verifyEmail(store, {
      email: "other14@example.com",
      code: devMailbox(store, "other14@example.com")!.code,
      now: now + 40_000,
      secret: SECRET,
    });
    if (!second.ok) throw new Error("second");
    expect(attachVpnRef(store, second.accountId, "vpn_1001")).toEqual({ ok: false, error: "conflict" });
    expect(linkTelegramId(store, { accountId: second.accountId, telegramId: "1001", proofHash: createHash("sha256").update("link").digest("hex"), now, vpnRef: "vpn_1001" })).toMatchObject({
      ok: false,
      error: "conflict",
    });
    expect(accountById(store, second.accountId)?.telegram_id).toBeNull();
    expect(accountById(store, login.accountId)?.vpn_user_ref).toBe("vpn_1001");
  });

  it("hides another user's order and device, and rejects a bad or replayed Telegram proof", async () => {
    const store = fresh();
    const now = Date.now();
    const owner = loginTelegramId(store, {
      telegramId: "1001",
      proofHash: createHash("sha256").update(`owner-${now}`).digest("hex"),
      now,
      vpnDown: false,
      vpnRef: "vpn_1001",
    });
    const stranger = loginTelegramId(store, {
      telegramId: "1002",
      proofHash: createHash("sha256").update(`stranger-${now}`).digest("hex"),
      now,
      vpnDown: false,
      vpnRef: "vpn_1002",
    });
    if (!owner.ok || !stranger.ok) throw new Error("login");
    const order = startOrder(store, owner.accountId, now);
    expect(ownedOrder(store, stranger.accountId, order.id)).toBeNull();
    expect(ownedOrder(store, owner.accountId, order.id)?.id).toBe(order.id);
    const adapter = httpAdapter(cfg(null));
    expect(await adapter.revokeDevice?.("vpn_1001", "dev_router")).toEqual({ ok: false, error: "not_found" });
    expect(await adapter.revokeDevice?.("vpn_1002", "dev_phone")).toEqual({ ok: false, error: "not_found" });
    expect((await adapter.readAccount(store, accountById(store, owner.accountId)!)).down).toBe(false);
    const minted = await fetch(`${stand.url}/oidc/id-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: 1001, nonce: "nonce-14", client_id: stand.clientId, client_secret: "wrong" }),
    });
    expect(minted.status).toBe(401);
    const tokenRes = await fetch(`${stand.url}/oidc/id-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: 1001, nonce: "nonce-14", client_id: stand.clientId, client_secret: stand.clientSecret }),
    });
    const { id_token: idToken } = (await tokenRes.json()) as { id_token: string };
    const jwks = (await fetch(`${stand.url}/.well-known/jwks.json`).then((res) => res.json())) as { keys: [] };
    expect(verifyTelegramIdToken(idToken, { clientId: stand.clientId, nonce: "nonce-14", now, keys: jwks.keys, issuer: stand.issuer })).toEqual({
      ok: true,
      id: "1001",
    });
    expect(verifyTelegramIdToken(idToken, { clientId: stand.clientId, nonce: "other", now, keys: jwks.keys, issuer: stand.issuer }).ok).toBe(false);
    const parts = idToken.split(".");
    const changed = parts[2][8] === "A" ? "B" : "A";
    const flipped = `${parts[0]}.${parts[1]}.${parts[2].slice(0, 8)}${changed}${parts[2].slice(9)}`;
    expect(verifyTelegramIdToken(flipped, { clientId: stand.clientId, nonce: "nonce-14", now, keys: jwks.keys, issuer: stand.issuer }).ok).toBe(false);
    const hash = createHash("sha256").update(idToken).digest("hex");
    expect(loginTelegramId(store, { telegramId: "4242", proofHash: hash, now, vpnDown: false, vpnRef: null }).ok).toBe(true);
    expect(loginTelegramId(store, { telegramId: "4242", proofHash: hash, now, vpnDown: false, vpnRef: null })).toMatchObject({ ok: false, error: "replay" });
    useEnv({ VPN_BASE_URL: stand.url, VPN_API_TOKEN: stand.token, ORASAKA_PROFILE: "isolated" });
    const statsBefore = (await fetch(`${stand.url}/control/stats`, { headers: { authorization: `Bearer ${stand.token}` } }).then((res) => res.json())) as { users: number };
    expect(await resolveTelegramVpn(store, "555001")).toEqual({ down: false, ref: null });
    const statsAfter = (await fetch(`${stand.url}/control/stats`, { headers: { authorization: `Bearer ${stand.token}` } }).then((res) => res.json())) as { users: number };
    expect(statsAfter.users).toBe(statsBefore.users);
    const route = readFileSync(new URL("../src/app/api/auth/telegram/oidc/route.ts", import.meta.url), "utf8");
    expect(route).not.toContain("vpnDown: true");
    expect(route).toContain("resolveTelegramVpn");
    expect(readFileSync(new URL("../src/app/api/public/checkout/route.ts", import.meta.url), "utf8")).not.toMatch(/body\??\.amount/);
    const button = readFileSync(new URL("../src/components/telegram-login.tsx", import.meta.url), "utf8");
    expect(button).toContain('addEventListener("focus"');
    expect(button).toContain("Вход через Telegram не подключён");
  });

  it("refuses a stand issuer, dev mail, and the double on the public profile, and keeps payments off without the flag", () => {
    useEnv({
      ORASAKA_PROFILE: "public",
      ORASAKA_DB_PATH: "/tmp/orasaka-v14-guard.sqlite",
      TELEGRAM_OIDC_ISSUER: stand.url,
    });
    expect(() => assertBootConfig()).toThrow(/issuer/);
    useEnv({ TELEGRAM_OIDC_ISSUER: undefined, MAIL_MODE: "dev" });
    expect(() => assertBootConfig()).toThrow(/MAIL_MODE=dev/);
    useEnv({ MAIL_MODE: undefined, VPN_MODE: "double" });
    expect(() => assertBootConfig()).toThrow(/VPN_MODE=double/);
    useEnv({
      VPN_MODE: undefined,
      PAYMENTS_READY: undefined,
      YOOKASSA_SHOP_ID: "shop",
      YOOKASSA_SECRET_KEY: "secret",
      YOOKASSA_MODE: "test",
      YOOKASSA_API_BASE: "http://127.0.0.1:9/v3",
    });
    expect(paymentsReady()).toBe(false);
    useEnv({ PAYMENTS_READY: "1" });
    expect(paymentsReady()).toBe(false);
    useEnv({ VPN_DURATION_RULE: "test-30-day-blocks" });
    expect(() => assertBootConfig()).toThrow(/duration/);
    useEnv({ ORASAKA_PROFILE: "isolated", VPN_DURATION_RULE: undefined });
    expect(paymentsReady()).toBe(false);
    useEnv({ VPN_DURATION_RULE: "test-30-day-blocks", YOOKASSA_LOCAL_STAND: "1" });
    expect(paymentsReady()).toBe(true);
    expect(readFileSync(new URL("../openapi/vpn-v1.yaml", import.meta.url), "utf8")).toMatch(/not Remnawave/);
    expect(readFileSync(new URL("../src/lib/i18n/dictionaries.ts", import.meta.url), "utf8")).toContain("контрактный стенд");
    expect(readFileSync(new URL("../src/components/login-form.tsx", import.meta.url), "utf8")).toContain("d.tgStand");
  });
});

function startOrder(store: Store, accountId: string, now: number) {
  const order = placeOrder(store, { accountId, planId: "1m", kind: "new", idempotencyKey: randomUUID(), now });
  if ("error" in order) throw new Error(order.error);
  return order;
}
