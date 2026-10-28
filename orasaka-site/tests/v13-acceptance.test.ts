import { createHash, createSign, generateKeyPairSync, randomUUID, type KeyObject } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer as createNet, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TLSSocket } from "node:tls";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as mailboxPost } from "../src/app/api/dev/mailbox/route";
import { POST as proofPost } from "../src/app/api/dev/telegram-proof/route";
import { verifyTelegramIdToken } from "../src/lib/auth/telegram-oidc";
import { mintDoubleProof } from "../src/lib/auth/telegram";
import { CABINET_COPY, buildCabinet } from "../src/lib/cabinet-view";
import { sendSmtp } from "../src/lib/mail/smtp";
import { placeOrder } from "../src/lib/server/billing";
import { clientIp } from "../src/lib/server/client-ip";
import { resetStoreForTests } from "../src/lib/server/db";
import { assertBootConfig } from "../src/lib/server/profile";
import {
  accountById,
  backupDatabase,
  beginLoginAttempt,
  consumeLoginAttempt,
  copyDatabaseFiles,
  loginTelegramId,
  loginWithProof,
  openStore,
  requestEmail,
  verifyEmail,
  type Store,
} from "../src/lib/server/store";
import { telegramMode } from "../src/lib/server/telegram-mode";
import { doubleAdapter, seedDouble, unconfiguredAdapter } from "../src/lib/vpn/adapter";

const SECRET = "v13-code-secret-value";
const DOUBLE = "v13-double-secret-value";
const ENV_KEYS = [
  "ORASAKA_PROFILE",
  "ORASAKA_DB_PATH",
  "MAIL_MODE",
  "VPN_MODE",
  "SMTP_INSECURE",
  "TRUST_PROXY",
  "ORASAKA_DOUBLE_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_BOT_USERNAME",
  "TELEGRAM_LOGIN_CLIENT_ID",
  "TELEGRAM_LOGIN_CLIENT_SECRET",
] as const;

const open: Store[] = [];
let savedEnv: Record<string, string | undefined> = {};

function useStore(): Store {
  const dir = mkdtempSync(join(tmpdir(), "orasaka-v13-"));
  const store = openStore(join(dir, "site.sqlite"));
  open.push(store);
  return store;
}

function saveEnv(): void {
  savedEnv = {};
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
}

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  restoreEnv();
  resetStoreForTests();
  for (const store of open.splice(0)) store.close();
});

function signIdToken(payload: Record<string, unknown>, key: KeyObject, kid: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${header}.${body}`;
  const sig = createSign("RSA-SHA256").update(data).sign(key).toString("base64url");
  return `${data}.${sig}`;
}

describe("v13 public profile", () => {
  it("refuses to boot a public profile with dev mail, the double, a relative database, or a bad proxy flag", () => {
    saveEnv();
    process.env.ORASAKA_PROFILE = "public";
    delete process.env.TRUST_PROXY;
    delete process.env.SMTP_INSECURE;
    process.env.ORASAKA_DB_PATH = "/tmp/orasaka-v13-guard.sqlite";
    process.env.MAIL_MODE = "dev";
    delete process.env.VPN_MODE;
    expect(() => assertBootConfig()).toThrow(/MAIL_MODE=dev/);
    delete process.env.MAIL_MODE;
    process.env.VPN_MODE = "double";
    expect(() => assertBootConfig()).toThrow(/VPN_MODE=double/);
    delete process.env.VPN_MODE;
    process.env.SMTP_INSECURE = "1";
    expect(() => assertBootConfig()).toThrow(/SMTP_INSECURE/);
    delete process.env.SMTP_INSECURE;
    process.env.ORASAKA_DB_PATH = "data/orasaka.sqlite";
    expect(() => assertBootConfig()).toThrow(/absolute/);
    process.env.ORASAKA_DB_PATH = join(process.cwd(), "data", "site.sqlite");
    expect(() => assertBootConfig()).toThrow(/outside/);
    process.env.ORASAKA_DB_PATH = "/tmp/orasaka-v13-guard.sqlite";
    process.env.TRUST_PROXY = "yes";
    expect(() => assertBootConfig()).toThrow(/TRUST_PROXY/);
    delete process.env.TRUST_PROXY;
    process.env.ORASAKA_PROFILE = "isolated";
    process.env.MAIL_MODE = "dev";
    process.env.VPN_MODE = "double";
    expect(() => assertBootConfig()).not.toThrow();
  });

  it("returns 404 for dev routes on the public profile even when the flags are set", async () => {
    saveEnv();
    process.env.ORASAKA_PROFILE = "public";
    process.env.MAIL_MODE = "dev";
    process.env.VPN_MODE = "double";
    process.env.ORASAKA_DOUBLE_SECRET = DOUBLE;
    process.env.ORASAKA_DB_PATH = "data/orasaka.sqlite";
    const headers = { host: "127.0.0.1", origin: "http://127.0.0.1", "content-type": "application/json" };
    const mailbox = await mailboxPost(
      new NextRequest("http://127.0.0.1/api/dev/mailbox", { method: "POST", headers, body: JSON.stringify({ email: "a@example.com" }) }),
    );
    const proof = await proofPost(
      new NextRequest("http://127.0.0.1/api/dev/telegram-proof", { method: "POST", headers, body: JSON.stringify({ fixture: "paid" }) }),
    );
    expect(mailbox.status).toBe(404);
    expect(proof.status).toBe(404);
  });

  it("keeps the official login off unless real credentials are set, and never treats the double as public", () => {
    saveEnv();
    process.env.ORASAKA_PROFILE = "public";
    process.env.VPN_MODE = "double";
    process.env.ORASAKA_DOUBLE_SECRET = DOUBLE;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_USERNAME;
    delete process.env.TELEGRAM_LOGIN_CLIENT_ID;
    delete process.env.TELEGRAM_LOGIN_CLIENT_SECRET;
    expect(telegramMode()).toEqual({ kind: "off" });
    process.env.TELEGRAM_BOT_TOKEN = "000000:local-test";
    expect(telegramMode()).toEqual({ kind: "off" });
    process.env.TELEGRAM_BOT_USERNAME = "orasaka_login_bot";
    expect(telegramMode()).toEqual({ kind: "widget", botUsername: "orasaka_login_bot" });
    process.env.TELEGRAM_LOGIN_CLIENT_ID = "4242";
    process.env.TELEGRAM_LOGIN_CLIENT_SECRET = "local-client-secret";
    expect(telegramMode()).toEqual({ kind: "oidc", clientId: "4242" });
    process.env.ORASAKA_PROFILE = "isolated";
    delete process.env.TELEGRAM_LOGIN_CLIENT_ID;
    delete process.env.TELEGRAM_LOGIN_CLIENT_SECRET;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_USERNAME;
    expect(telegramMode()).toEqual({ kind: "double" });
    const login = readFileSync(new URL("../src/components/login-form.tsx", import.meta.url), "utf8");
    const button = readFileSync(new URL("../src/components/telegram-login.tsx", import.meta.url), "utf8");
    expect(login).not.toContain("был ли аккаунт");
    expect(login).toContain("finally");
    expect(button).toContain("Вход через Telegram не подключён");
    expect(button).not.toContain("/api/dev/telegram-proof");
  });

  it("does not let two clients share one limit, and a spoofed X-Forwarded-For does not open a new one", () => {
    const store = useStore();
    const now = Date.UTC(2026, 9, 21, 8, 0, 0);
    const left = clientIp({ trustProxy: false, forwardedFor: "198.51.100.50", peerAddress: "203.0.113.10" });
    const right = clientIp({ trustProxy: false, forwardedFor: "198.51.100.50", peerAddress: "203.0.113.11" });
    expect(left).toBe("203.0.113.10");
    expect(right).toBe("203.0.113.11");
    const spoofA = clientIp({ trustProxy: true, forwardedFor: "198.51.100.1, 203.0.113.10", peerAddress: "10.0.0.8" });
    const spoofB = clientIp({ trustProxy: true, forwardedFor: "203.0.113.99, 10.0.0.8", peerAddress: "10.0.0.8" });
    expect(spoofA).toBe("untrusted-forwarded");
    expect(spoofB).toBe(spoofA);
    expect(clientIp({ trustProxy: true, forwardedFor: "203.0.113.10", peerAddress: "10.0.0.8" })).toBe("203.0.113.10");
    for (let i = 0; i < 20; i += 1) {
      const sent = requestEmail(store, { email: `left${i}@example.com`, ip: left, now: now + i, secret: SECRET, mode: "dev" });
      expect(sent).toMatchObject({ ok: true, delivered: true });
    }
    expect(requestEmail(store, { email: "left-extra@example.com", ip: left, now: now + 30, secret: SECRET, mode: "dev" })).toMatchObject({ delivered: false });
    expect(requestEmail(store, { email: "right0@example.com", ip: right, now: now, secret: SECRET, mode: "dev" })).toMatchObject({ delivered: true });
    for (let i = 0; i < 5; i += 1) {
      expect(requestEmail(store, { email: "same@example.com", ip: "198.51.100.20", now: now + i * 31_000, secret: SECRET, mode: "dev" })).toMatchObject({ delivered: true });
    }
    expect(requestEmail(store, { email: "same@example.com", ip: "198.51.100.20", now: now + 6 * 31_000, secret: SECRET, mode: "dev" })).toMatchObject({ delivered: false });
    expect(requestEmail(store, { email: "other@example.com", ip: "198.51.100.20", now: now + 6 * 31_000, secret: SECRET, mode: "dev" })).toMatchObject({ delivered: true });
  });

  it("keeps an active subscription visible while a renewal is waiting, and does not invent a subscription when VPN is unconfigured", () => {
    const store = useStore();
    const now = Date.UTC(2026, 9, 21, 9, 0, 0);
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
    const account = accountById(store, login.accountId)!;
    const order = placeOrder(store, { accountId: account.id, planId: "1m", kind: "renewal", idempotencyKey: randomUUID(), now });
    if ("error" in order) throw new Error(order.error);
    store.db.prepare("update site_order set status = 'paid' where id = ?").run(order.id);
    store.db.prepare("insert into fulfillment (order_id, status, attempts, updated_at) values (?, 'pending', 0, ?)").run(order.id, new Date(now).toISOString());
    const active = buildCabinet(store, account, doubleAdapter().readAccount(store, account), now);
    expect(active.state).toBe("active");
    expect(active.renewal).toBe("preparing");
    expect(active.expiresAt).toBeTruthy();
    expect(active.connectionUrl).toContain("test-double://");
    const code = requestEmail(store, { email: "plain@example.com", ip: "203.0.113.40", now, secret: SECRET, mode: "dev" });
    expect(code.ok && code.code).toBeTruthy();
    if (!code.ok || !code.code) return;
    const created = verifyEmail(store, { email: "plain@example.com", code: code.code, now, secret: SECRET });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const plain = accountById(store, created.accountId)!;
    const missing = buildCabinet(store, plain, unconfiguredAdapter().readAccount(store, plain), now);
    expect(missing.state).toBe("unavailable");
    expect(missing.vpnReason).toBe("unconfigured");
    expect(missing.expiresAt).toBeNull();
    expect(missing.connectionUrl).toBeNull();
    expect(missing.orders).toEqual([]);
    expect(CABINET_COPY.unconfigured).toMatch(/не подключён/);
    expect(CABINET_COPY.botPurchases).toMatch(/не восстанавливаются/);
    expect(CABINET_COPY.devices).toMatch(/недоступен/);
    expect(CABINET_COPY.online).toBe("Статус онлайн недоступен.");
    expect(CABINET_COPY.online).not.toMatch(/^0/);
  });

  it("restores a vacuum backup and a copy that includes the WAL", () => {
    const dir = mkdtempSync(join(tmpdir(), "orasaka-v13-bak-"));
    const store = openStore(join(dir, "site.sqlite"));
    open.push(store);
    const now = Date.UTC(2026, 9, 21, 10, 0, 0);
    const sent = requestEmail(store, { email: "keep@example.com", ip: "203.0.113.70", now, secret: SECRET, mode: "dev" });
    if (!sent.ok || !sent.code) throw new Error("code");
    const account = verifyEmail(store, { email: "keep@example.com", code: sent.code, now, secret: SECRET });
    if (!account.ok) throw new Error("account");
    const vacuum = join(dir, "vacuum.sqlite");
    backupDatabase(store, vacuum);
    store.db.exec("PRAGMA wal_autocheckpoint = 0");
    store.db.prepare("insert into site_account (id, email, created_at) values ('acc_wal', 'wal@example.com', ?)").run(new Date(now).toISOString());
    expect(statSync(`${store.path}-wal`).size).toBeGreaterThan(0);
    const copied = join(dir, "copy.sqlite");
    copyDatabaseFiles(store.path, copied);
    expect(existsSync(`${copied}-wal`)).toBe(true);
    const fromVacuum = openStore(vacuum);
    open.push(fromVacuum);
    expect(accountById(fromVacuum, account.accountId)?.email).toBe("keep@example.com");
    const fromCopy = openStore(copied);
    open.push(fromCopy);
    expect(accountById(fromCopy, "acc_wal")?.email).toBe("wal@example.com");
    expect(accountById(fromCopy, account.accountId)?.email).toBe("keep@example.com");
  });

  it("accepts a numeric Telegram id from a local RS256 token and rejects username, bad signature, expiry, nonce, and replay", () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" });
    jwk.kid = "local-1";
    const now = Date.UTC(2026, 9, 21, 11, 0, 0);
    const claims = {
      iss: "https://oauth.telegram.org",
      aud: "4242",
      sub: "777001",
      id: 1001,
      preferred_username: "not_the_id",
      nonce: "nonce-1",
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + 600,
    };
    const token = signIdToken(claims, privateKey, "local-1");
    expect(verifyTelegramIdToken(token, { clientId: "4242", nonce: "nonce-1", now, keys: [jwk] })).toEqual({ ok: true, id: "1001" });
    const usernameOnly = signIdToken({ ...claims, id: undefined, preferred_username: "not_the_id" }, privateKey, "local-1");
    expect(verifyTelegramIdToken(usernameOnly, { clientId: "4242", nonce: "nonce-1", now, keys: [jwk] }).ok).toBe(false);
    const parts = token.split(".");
    const changed = parts[2][8] === "A" ? "B" : "A";
    const flipped = `${parts[0]}.${parts[1]}.${parts[2].slice(0, 8)}${changed}${parts[2].slice(9)}`;
    expect(verifyTelegramIdToken(flipped, { clientId: "4242", nonce: "nonce-1", now, keys: [jwk] }).ok).toBe(false);
    const expired = signIdToken({ ...claims, exp: Math.floor(now / 1000) - 5 }, privateKey, "local-1");
    expect(verifyTelegramIdToken(expired, { clientId: "4242", nonce: "nonce-1", now, keys: [jwk] })).toMatchObject({ ok: false, error: "expired" });
    expect(verifyTelegramIdToken(token, { clientId: "4242", nonce: "other", now, keys: [jwk] }).ok).toBe(false);
    const store = useStore();
    const started = beginLoginAttempt(store, now);
    expect(consumeLoginAttempt(store, started.nonce, now)).toBe(true);
    expect(consumeLoginAttempt(store, started.nonce, now)).toBe(false);
    const proofHash = createHash("sha256").update(token).digest("hex");
    expect(loginTelegramId(store, { telegramId: "1001", proofHash, now, vpnDown: false, vpnRef: "vpn_ref_1001" }).ok).toBe(true);
    expect(loginTelegramId(store, { telegramId: "1001", proofHash, now, vpnDown: false, vpnRef: "vpn_ref_1001" })).toMatchObject({ ok: false, error: "replay" });
    const row = store.db.prepare("select telegram_id from site_account where telegram_id = ?").get("1001") as { telegram_id: string };
    expect(row.telegram_id).toBe("1001");
  });
});

describe("v13 smtp", () => {
  function certPair(): { key: string; cert: string } {
    const dir = mkdtempSync(join(tmpdir(), "orasaka-v13-cert-"));
    execFileSync("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-keyout",
      "key.pem",
      "-out",
      "cert.pem",
      "-days",
      "1",
      "-nodes",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1",
    ], { cwd: dir });
    const pair = { key: readFileSync(join(dir, "key.pem"), "utf8"), cert: readFileSync(join(dir, "cert.pem"), "utf8") };
    rmSync(dir, { recursive: true, force: true });
    return pair;
  }

  function attach(socket: Socket | TLSSocket, ctx: { key: string; cert: string; body: string; authed: boolean }, onUpgrade: (next: TLSSocket) => void) {
    let buf = "";
    let mode: "cmd" | "data" = "cmd";
    let auth: "none" | "user" | "pass" = "none";
    const write = (line: string) => socket.write(line);
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      if (mode === "data") {
        ctx.body += buf;
        buf = "";
        if (ctx.body.includes("\r\n.\r\n")) {
          write("250 queued\r\n");
          mode = "cmd";
        }
        return;
      }
      let index = buf.indexOf("\n");
      while (index >= 0 && mode === "cmd") {
        const line = buf.slice(0, index).replace(/\r$/, "");
        buf = buf.slice(index + 1);
        const upper = line.toUpperCase();
        if (auth === "user") {
          auth = "pass";
          write("334 UGFzc3dvcmQ6\r\n");
        } else if (auth === "pass") {
          ctx.authed = Buffer.from(line, "base64").toString("utf8") === "secret";
          write(ctx.authed ? "235 ok\r\n" : "535 no\r\n");
          auth = "none";
        } else if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
          write("250-local\r\n250-STARTTLS\r\n250 AUTH PLAIN LOGIN\r\n");
        } else if (upper === "STARTTLS") {
          write("220 tls\r\n");
          socket.removeAllListeners("data");
          const next = new TLSSocket(socket, { isServer: true, key: ctx.key, cert: ctx.cert });
          onUpgrade(next);
          return;
        } else if (upper.startsWith("AUTH PLAIN")) {
          const decoded = Buffer.from(line.slice("AUTH PLAIN".length).trim(), "base64").toString("utf8").split("\0");
          ctx.authed = decoded[1] === "mailer" && decoded[2] === "secret";
          write(ctx.authed ? "235 ok\r\n" : "535 no\r\n");
        } else if (upper === "AUTH LOGIN") {
          auth = "user";
          write("334 VXNlcm5hbWU6\r\n");
        } else if (upper.startsWith("MAIL") || upper.startsWith("RCPT")) {
          write("250 ok\r\n");
        } else if (upper === "DATA") {
          mode = "data";
          write("354 go\r\n");
        } else if (upper.startsWith("QUIT")) {
          write("221 bye\r\n");
        } else if (line) {
          write("500 no\r\n");
        }
        index = buf.indexOf("\n");
      }
    });
  }

  async function listen(server: Server): Promise<number> {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    return typeof address === "object" && address ? address.port : 0;
  }

  async function stop(server: Server, sockets: Set<Socket>): Promise<void> {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  it("sends through STARTTLS with certificate verification, AUTH, and a multiline greeting", async () => {
    const pair = certPair();
    const ctx = { ...pair, body: "", authed: false };
    const sockets = new Set<Socket>();
    const server = createNet((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.write("220-orasaka\r\n220 ready\r\n");
      const start = (current: Socket | TLSSocket) => attach(current, ctx, start);
      start(socket);
    });
    const port = await listen(server);
    try {
      await sendSmtp({
        host: "127.0.0.1",
        port,
        secure: false,
        user: "mailer",
        pass: "secret",
        ca: pair.cert,
        from: "codes@example.com",
        to: "person@example.com",
        subject: "Код входа ORASAKA",
        text: "Код для входа: 123456\n",
        timeoutMs: 5000,
      });
      expect(ctx.authed).toBe(true);
      const encoded = ctx.body.split("\r\n\r\n")[1]?.split("\r\n")[0] ?? "";
      expect(Buffer.from(encoded, "base64").toString("utf8")).toContain("123456");
      await expect(
        sendSmtp({
          host: "127.0.0.1",
          port,
          secure: false,
          user: "mailer",
          pass: "secret",
          from: "codes@example.com",
          to: "person@example.com",
          subject: "Код входа ORASAKA",
          text: "Код для входа: 654321\n",
          timeoutMs: 5000,
        }),
      ).rejects.toThrow();
    } finally {
      await stop(server, sockets);
    }
  });

  it("times out when the server never greets", async () => {
    const sockets = new Set<Socket>();
    const server = createNet((socket) => {
      sockets.add(socket);
    });
    const port = await listen(server);
    try {
      await expect(
        sendSmtp({
          host: "127.0.0.1",
          port,
          from: "codes@example.com",
          to: "person@example.com",
          subject: "Код",
          text: "Код для входа: 000000\n",
          timeoutMs: 400,
        }),
      ).rejects.toThrow();
    } finally {
      await stop(server, sockets);
    }
  });
});
