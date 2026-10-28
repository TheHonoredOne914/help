import { createSign, generateKeyPairSync, randomUUID, timingSafeEqual, type JsonWebKey, type KeyObject } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { extendExpiresAt, parseDurationRule } from "./duration-rule";

/**
 * Local contract stand. Not the live bot and not Remnawave.
 * Device rows and grant math are fixtures for this process only.
 * ponytail: one in-memory lock per order id. Split it if the stand ever runs more than one process.
 */

const PAGE = 2;

export type StandFault = "ok" | "down" | "timeout" | "garbage" | "empty" | "purchases_down" | "devices_down" | "no_subscription";

type Device = { id: string; label: string; lastActiveAt: string | null; online: boolean | null };
type Purchase = { id: string; orderId: string | null; amountMinor: number; currency: "RUB"; termMonths: number | null; paidAt: string; status: string };
type VpnUser = {
  id: string;
  telegramId: string | null;
  email: string | null;
  siteAccountId: string | null;
  expiresAt: string | null;
  termMonths: number | null;
  online: "known" | "unknown";
  history: "stored" | "not_stored";
  devices: Device[];
  purchases: Purchase[];
};

type GrantRow = { ref: string; expiresAt: string; termMonths: number; connectionUrl: string };

export type VpnStand = {
  url: string;
  issuer: string;
  token: string;
  clientId: string;
  clientSecret: string;
  close: () => Promise<void>;
};

function b64url(value: Buffer | string): string {
  const buf = typeof value === "string" ? Buffer.from(value) : value;
  return buf.toString("base64url");
}

function signJwt(privateKey: KeyObject, kid: string, payload: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = createSign("RSA-SHA256").update(data).sign(privateKey);
  return `${data}.${sig.toString("base64url")}`;
}

function authed(header: string | undefined, token: string): boolean {
  const got = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = body === null ? "" : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(json);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 16_384) {
        reject(new Error("size"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function seed(now: number): Map<string, VpnUser> {
  const day = 24 * 60 * 60 * 1000;
  const users = new Map<string, VpnUser>();
  users.set("vpn_1001", {
    id: "vpn_1001",
    telegramId: "1001",
    email: null,
    siteAccountId: null,
    expiresAt: new Date(now + 20 * day).toISOString(),
    termMonths: 1,
    // The stand does not have a live presence feed, so online stays unknown until a test asks.
    online: "unknown",
    history: "stored",
    devices: [
      { id: "dev_phone", label: "Телефон", lastActiveAt: new Date(now - 2 * 60 * 1000).toISOString(), online: true },
      { id: "dev_laptop", label: "Ноутбук", lastActiveAt: new Date(now - 5 * day).toISOString(), online: false },
      { id: "dev_tablet", label: "Планшет", lastActiveAt: null, online: null },
    ],
    purchases: [
      { id: "bot_1001_1", orderId: null, amountMinor: 20_000, currency: "RUB", termMonths: 1, paidAt: new Date(now - 40 * day).toISOString(), status: "succeeded" },
      { id: "bot_1001_2", orderId: null, amountMinor: 50_000, currency: "RUB", termMonths: 3, paidAt: new Date(now - 20 * day).toISOString(), status: "succeeded" },
      { id: "bot_1001_3", orderId: null, amountMinor: 90_000, currency: "RUB", termMonths: 6, paidAt: new Date(now - 3 * day).toISOString(), status: "succeeded" },
    ],
  });
  users.set("vpn_1002", {
    id: "vpn_1002",
    telegramId: "1002",
    email: null,
    siteAccountId: null,
    expiresAt: new Date(now - 2 * day).toISOString(),
    termMonths: 1,
    online: "known",
    history: "not_stored",
    devices: [{ id: "dev_router", label: "Роутер", lastActiveAt: null, online: false }],
    purchases: [],
  });
  return users;
}

function findUser(users: Map<string, VpnUser>, query: URLSearchParams): VpnUser | null {
  const id = query.get("id");
  const telegram = query.get("telegram_id");
  const email = query.get("email");
  if (id) return users.get(id) ?? null;
  if (telegram) return [...users.values()].find((user) => user.telegramId === telegram) ?? null;
  if (email) return [...users.values()].find((user) => user.email === email) ?? null;
  return null;
}

export async function startVpnStand(opts?: {
  token?: string;
  clientId?: string;
  clientSecret?: string;
  port?: number;
  host?: string;
}): Promise<VpnStand> {
  const token = opts?.token ?? "local-stand-token";
  const clientId = opts?.clientId ?? "10001";
  const clientSecret = opts?.clientSecret ?? "local-stand-secret";
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
  jwk.kid = "stand-1";
  jwk.alg = "RS256";
  jwk.use = "sig";
  const users = seed(Date.now());
  const grants = new Map<string, GrantRow>();
  const tails = new Map<string, Promise<unknown>>();
  let fault: StandFault = "ok";
  const sockets = new Set<Socket>();

  function serial<T>(key: string, fn: () => T | Promise<T>): Promise<T> {
    const prev = tails.get(key) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    tails.set(key, run.then(() => undefined, () => undefined));
    return run;
  }

  function connectionUrl(id: string): string {
    return `stand://sub/${id}`;
  }

  function subscription(user: VpnUser) {
    const expiry = user.expiresAt ? Date.parse(user.expiresAt) : 0;
    const status = !user.expiresAt ? "none" : expiry > Date.now() ? "active" : "expired";
    return {
      id: `sub_${user.id}`,
      status,
      expires_at: user.expiresAt,
      term_months: user.termMonths,
      limits: { device_limit: null },
      connection: { url: connectionUrl(user.id) },
    };
  }

  function purchasePage(user: VpnUser, cursor: string | null) {
    if (user.history === "not_stored") return { items: [], next_cursor: null, boundary: "not_stored" };
    const start = cursor && /^\d+$/.test(cursor) ? Number(cursor) : 0;
    const slice = user.purchases.slice(start, start + PAGE);
    const next = start + PAGE < user.purchases.length ? String(start + PAGE) : null;
    const prev = start === 0 ? null : String(Math.max(0, start - PAGE));
    return {
      items: slice.map((item) => ({
        id: item.id,
        order_id: item.orderId,
        amount_minor: item.amountMinor,
        currency: item.currency,
        term_months: item.termMonths,
        paid_at: item.paidAt,
        status: item.status,
      })),
      next_cursor: next,
      prev_cursor: prev,
      boundary: null,
    };
  }

  function devicePage(user: VpnUser) {
    return {
      limit: null,
      online: user.online,
      items: user.devices.map((device) => ({
        id: device.id,
        label: device.label,
        last_active_at: device.lastActiveAt,
        online: device.online,
      })),
    };
  }

  const server = createServer((req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent) send(res, 500, { error: "down" });
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const host = req.headers.host ?? "127.0.0.1";
    const url = new URL(req.url ?? "/", `http://${host}`);
    if (req.method === "GET" && url.pathname === "/.well-known/jwks.json") {
      send(res, 200, { keys: [jwk] });
      return;
    }
    if (req.method === "POST" && url.pathname === "/oidc/id-token") {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as { id?: unknown; nonce?: unknown; client_id?: unknown; client_secret?: unknown };
      if (body.client_id !== clientId || body.client_secret !== clientSecret) {
        send(res, 401, { error: "forbidden" });
        return;
      }
      const id = typeof body.id === "number" ? body.id : Number(body.id);
      if (!Number.isSafeInteger(id) || id < 0 || typeof body.nonce !== "string" || !body.nonce) {
        send(res, 400, { error: "bad_request" });
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      const issuer = `http://${host}`;
      const idToken = signJwt(privateKey, "stand-1", {
        iss: issuer,
        aud: clientId,
        id,
        nonce: body.nonce,
        iat: now,
        exp: now + 600,
      });
      send(res, 200, { id_token: idToken });
      return;
    }
    if (!authed(req.headers.authorization, token)) {
      send(res, 401, { error: "forbidden" });
      return;
    }
    if (req.method === "POST" && url.pathname === "/control/fault") {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as { fault?: StandFault; online?: "known" | "unknown"; user?: string };
      if (body.fault) fault = body.fault;
      const user = users.get(body.user ?? "vpn_1001");
      if (user && (body.online === "known" || body.online === "unknown")) user.online = body.online;
      send(res, 200, { fault, users: users.size });
      return;
    }
    if (req.method === "GET" && url.pathname === "/control/stats") {
      send(res, 200, { users: users.size, grants: grants.size });
      return;
    }
    if (fault === "timeout") {
      setTimeout(() => {
        if (!res.writableEnded) send(res, 503, { error: "down" });
      }, 15_000).unref();
      return;
    }
    if (fault === "garbage") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("not-json");
      return;
    }
    if (fault === "down") {
      send(res, 503, { error: "down" });
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/users") {
      const user = findUser(users, url.searchParams);
      send(res, 200, { user: user ? { id: user.id, telegram_id: user.telegramId, email: user.email } : null });
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/users") {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as { telegram_id?: unknown; email?: unknown; site_account_id?: unknown };
      const telegramId = typeof body.telegram_id === "string" ? body.telegram_id : null;
      const email = typeof body.email === "string" ? body.email : null;
      const siteAccountId = typeof body.site_account_id === "string" ? body.site_account_id : null;
      const byTelegram = telegramId ? ([...users.values()].find((user) => user.telegramId === telegramId) ?? null) : null;
      const bySite = siteAccountId ? ([...users.values()].find((user) => user.siteAccountId === siteAccountId) ?? null) : null;
      if (byTelegram && bySite && byTelegram.id !== bySite.id) {
        send(res, 409, { error: "conflict" });
        return;
      }
      const user = byTelegram ?? bySite;
      if (user) {
        if (telegramId && user.telegramId && user.telegramId !== telegramId) {
          send(res, 409, { error: "conflict" });
          return;
        }
        if (siteAccountId && user.siteAccountId && user.siteAccountId !== siteAccountId) {
          send(res, 409, { error: "conflict" });
          return;
        }
        if (telegramId && !user.telegramId) user.telegramId = telegramId;
        if (email && !user.email) user.email = email;
        if (siteAccountId && !user.siteAccountId) user.siteAccountId = siteAccountId;
        send(res, 200, { user: { id: user.id, telegram_id: user.telegramId, email: user.email }, created: false });
        return;
      }
      const id = `vpn_${randomUUID()}`;
      const created: VpnUser = {
        id,
        telegramId,
        email,
        siteAccountId,
        expiresAt: null,
        termMonths: null,
        online: "unknown",
        history: "stored",
        devices: [],
        purchases: [],
      };
      users.set(id, created);
      send(res, 200, { user: { id, telegram_id: telegramId, email }, created: true });
      return;
    }
    const sub = url.pathname.match(/^\/v1\/users\/([^/]+)\/subscription$/);
    const buys = url.pathname.match(/^\/v1\/users\/([^/]+)\/purchases$/);
    const devs = url.pathname.match(/^\/v1\/users\/([^/]+)\/devices$/);
    const revoke = url.pathname.match(/^\/v1\/users\/([^/]+)\/devices\/([^/]+)\/revoke$/);
    if (sub && req.method === "GET") {
      const user = users.get(decodeURIComponent(sub[1]));
      if (!user || fault === "no_subscription") {
        send(res, 404, { error: "not_found" });
        return;
      }
      send(res, 200, subscription(user));
      return;
    }
    if (buys && req.method === "GET") {
      if (fault === "purchases_down") {
        send(res, 503, { error: "down" });
        return;
      }
      const user = users.get(decodeURIComponent(buys[1]));
      if (!user) {
        send(res, 404, { error: "not_found" });
        return;
      }
      if (fault === "empty") {
        send(res, 200, { items: [], next_cursor: null, boundary: null });
        return;
      }
      send(res, 200, purchasePage(user, url.searchParams.get("cursor")));
      return;
    }
    if (devs && req.method === "GET") {
      if (fault === "devices_down") {
        send(res, 503, { error: "down" });
        return;
      }
      const user = users.get(decodeURIComponent(devs[1]));
      if (!user) {
        send(res, 404, { error: "not_found" });
        return;
      }
      if (fault === "empty") {
        send(res, 200, { limit: null, online: "unknown", items: [] });
        return;
      }
      send(res, 200, devicePage(user));
      return;
    }
    if (revoke && req.method === "POST") {
      const user = users.get(decodeURIComponent(revoke[1]));
      const deviceId = decodeURIComponent(revoke[2]);
      if (!user) {
        send(res, 404, { error: "not_found" });
        return;
      }
      const index = user.devices.findIndex((device) => device.id === deviceId);
      if (index < 0) {
        send(res, 404, { error: "not_found" });
        return;
      }
      user.devices.splice(index, 1);
      send(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/grants") {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as {
        order_id?: unknown;
        site_account_id?: unknown;
        telegram_id?: unknown;
        email?: unknown;
        term_months?: unknown;
        duration_rule?: unknown;
      };
      const orderId = typeof body.order_id === "string" ? body.order_id : "";
      const termMonths = typeof body.term_months === "number" ? body.term_months : 0;
      const telegramId = typeof body.telegram_id === "string" ? body.telegram_id : null;
      const siteAccountId = typeof body.site_account_id === "string" ? body.site_account_id : null;
      if (!orderId || !Number.isInteger(termMonths) || termMonths < 1) {
        send(res, 400, { error: "bad_request" });
        return;
      }
      const rule = typeof body.duration_rule === "string" ? parseDurationRule(body.duration_rule) : null;
      if (!rule) {
        send(res, 409, { error: "duration_unconfigured" });
        return;
      }
      const result = await serial(orderId, () => {
        const prior = grants.get(orderId);
        if (prior) return { ...prior, already_granted: true };
        const byTelegram = telegramId ? ([...users.values()].find((user) => user.telegramId === telegramId) ?? null) : null;
        const bySite = siteAccountId ? ([...users.values()].find((user) => user.siteAccountId === siteAccountId) ?? null) : null;
        if (byTelegram && bySite && byTelegram.id !== bySite.id) return { error: "conflict" as const };
        let user = byTelegram ?? bySite;
        if (!user) {
          const id = `vpn_${siteAccountId ?? randomUUID()}`;
          user = {
            id,
            telegramId,
            email: typeof body.email === "string" ? body.email : null,
            siteAccountId,
            expiresAt: null,
            termMonths: null,
            online: "unknown",
            history: "stored",
            devices: [],
            purchases: [],
          };
          users.set(id, user);
        } else {
          if (telegramId && !user.telegramId) user.telegramId = telegramId;
          if (siteAccountId && !user.siteAccountId) user.siteAccountId = siteAccountId;
        }
        const expiresAt = extendExpiresAt(user.expiresAt, termMonths, rule, Date.now());
        user.expiresAt = expiresAt;
        user.termMonths = termMonths;
        const row = { ref: user.id, expiresAt, termMonths, connectionUrl: connectionUrl(user.id) };
        grants.set(orderId, row);
        return { ...row, already_granted: false };
      });
      if ("error" in result) {
        send(res, 409, { error: "conflict" });
        return;
      }
      send(res, 200, {
        ref: result.ref,
        expires_at: result.expiresAt,
        term_months: result.termMonths,
        connection_url: result.connectionUrl,
        already_granted: result.already_granted,
      });
      return;
    }
    send(res, 404, { error: "not_found" });
  }

  const host = opts?.host ?? "127.0.0.1";
  await new Promise<void>((resolve) => server.listen(opts?.port ?? 0, host, () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const issuer = `http://${host}:${port}`;
  return {
    url: issuer,
    issuer,
    token,
    clientId,
    clientSecret,
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
