import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { checkProof } from "../auth/telegram";
import { SCHEMA_SQL } from "./schema";

export type Store = { db: DatabaseSync; path: string; close(): void };

export type Account = {
  id: string;
  email: string | null;
  email_verified_at: string | null;
  telegram_id: string | null;
  vpn_user_ref: string | null;
  created_at: string;
};

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const EMAIL_HOUR_LIMIT = 5;
const IP_HOUR_LIMIT = 20;
const RESEND_MS = 30 * 1000;
const SESSION_SECONDS = 30 * 24 * 60 * 60;

type Sql = SQLInputValue;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function busy(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("locked") || message.includes("SQLITE_BUSY") || message.includes("busy");
}

function unique(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("UNIQUE");
}

function immediate<T>(db: DatabaseSync, fn: () => T): T {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      db.exec("BEGIN IMMEDIATE");
    } catch (error) {
      if (attempt < 9 && busy(error)) continue;
      throw error;
    }
    try {
      const value = fn();
      db.exec("COMMIT");
      return value;
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* the connection may already be rolling back */
      }
      throw error;
    }
  }
  throw new Error("sqlite busy");
}

function one<T>(db: DatabaseSync, sql: string, ...params: Sql[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function requestNow(): number {
  return Date.now();
}

export function openStore(path: string): Store {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("create table if not exists schema_migrations (version integer primary key)");
  const version = one<{ version: number }>(db, "select version from schema_migrations where version = 1");
  if (!version) {
    db.exec("BEGIN");
    db.exec(SCHEMA_SQL);
    db.prepare("insert into schema_migrations (version) values (1)").run();
    db.exec("COMMIT");
  }
  db.exec("create table if not exists login_attempt (id_hash text primary key, expires_at text not null, consumed_at text)");
  db.exec(`create table if not exists site_crypto_invoice (
    id text primary key,
    order_id text not null references site_order (id),
    provider text not null check (provider = 'cryptopay'),
    provider_payment_id text,
    idempotency_key text not null unique,
    amount_minor integer not null check (amount_minor > 0),
    currency text not null check (currency = 'RUB'),
    test integer,
    status text not null,
    checkout_url text,
    paid_asset text,
    paid_amount text,
    created_at text not null,
    unique (provider, provider_payment_id)
  )`);
  return { db, path, close: () => db.close() };
}

const ATTEMPT_MS = 10 * 60 * 1000;

export function beginLoginAttempt(store: Store, now: number): { nonce: string; maxAge: number } {
  const nonce = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(nonce).digest("hex");
  store.db.prepare("insert into login_attempt (id_hash, expires_at) values (?, ?)").run(hash, iso(now + ATTEMPT_MS));
  return { nonce, maxAge: ATTEMPT_MS / 1000 };
}

/** One browser attempt. A second request with the same nonce fails. */
export function consumeLoginAttempt(store: Store, nonce: string, now: number): boolean {
  if (!nonce) return false;
  const hash = createHash("sha256").update(nonce).digest("hex");
  return immediate(store.db, () => {
    const row = one<{ expires_at: string; consumed_at: string | null }>(
      store.db,
      "select expires_at, consumed_at from login_attempt where id_hash = ?",
      hash,
    );
    if (!row || row.consumed_at || Date.parse(row.expires_at) <= now) return false;
    const result = store.db.prepare("update login_attempt set consumed_at = ? where id_hash = ? and consumed_at is null").run(iso(now), hash);
    return Number(result.changes) === 1;
  });
}

/** Consistent snapshot. VACUUM INTO folds the WAL, so the copy is one file. */
export function backupDatabase(store: Store, dest: string): void {
  if (dest.includes("'") || dest.includes("\0")) throw new Error("backup path");
  rmSync(dest, { force: true });
  store.db.exec(`VACUUM INTO '${dest}'`);
}

/** File copy for a crash snapshot. The -wal and -shm must travel with the database. */
export function copyDatabaseFiles(src: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  for (const suffix of ["-wal", "-shm"]) {
    if (existsSync(src + suffix)) copyFileSync(src + suffix, dest + suffix);
  }
}

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function codeMac(secret: string, id: string, email: string, code: string): string {
  return createHmac("sha256", secret).update(`${id}\n${email}\n${code}`).digest("hex");
}

function macEqual(stored: string, actual: string): boolean {
  const left = Buffer.from(stored, "hex");
  const right = Buffer.from(actual, "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

export type MailMode = "dev" | "smtp" | "off";

export function requestEmail(
  store: Store,
  input: { email: string; ip: string; now: number; secret: string; mode: MailMode },
):
  | { ok: true; delivered: boolean; code?: string; challengeId?: string }
  | { ok: false; error: "invalid_email" | "unconfigured" } {
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, error: "invalid_email" };
  if (input.mode === "off" || input.secret.length < 16) return { ok: false, error: "unconfigured" };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const challengeId = randomUUID();
  const mac = codeMac(input.secret, challengeId, email, code);
  return immediate(store.db, () => {
    const hourAgo = iso(input.now - 60 * 60 * 1000);
    const emailCount = one<{ n: number }>(
      store.db,
      "select count(*) as n from email_send_log where email = ? and sent_at > ?",
      email,
      hourAgo,
    );
    const ipCount = one<{ n: number }>(
      store.db,
      "select count(*) as n from email_send_log where ip = ? and sent_at > ?",
      input.ip,
      hourAgo,
    );
    const recent = one<{ sent_at: string }>(
      store.db,
      "select sent_at from email_send_log where email = ? order by sent_at desc limit 1",
      email,
    );
    const cooled = recent ? input.now - Date.parse(recent.sent_at) < RESEND_MS : false;
    if ((emailCount?.n ?? 0) >= EMAIL_HOUR_LIMIT || (ipCount?.n ?? 0) >= IP_HOUR_LIMIT || cooled) {
      return { ok: true as const, delivered: false };
    }
    store.db
      .prepare("insert into email_send_log (email, ip, sent_at) values (?, ?, ?)")
      .run(email, input.ip, iso(input.now));
    store.db
      .prepare("insert into email_challenge (id, email, code_mac, expires_at, attempts, sent_at) values (?, ?, ?, ?, 0, ?)")
      .run(challengeId, email, mac, iso(input.now + CODE_TTL_MS), iso(input.now));
    if (input.mode === "dev") {
      store.db
        .prepare(
          "insert into dev_mailbox (email, code, challenge_id, sent_at) values (?, ?, ?, ?) on conflict (email) do update set code = excluded.code, challenge_id = excluded.challenge_id, sent_at = excluded.sent_at",
        )
        .run(email, code, challengeId, iso(input.now));
    }
    return { ok: true as const, delivered: true, code, challengeId };
  });
}

export function devMailbox(store: Store, email: string): { code: string; challengeId: string } | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const row = one<{ code: string; challenge_id: string }>(
    store.db,
    "select code, challenge_id from dev_mailbox where email = ?",
    normalized,
  );
  return row ? { code: row.code, challengeId: row.challenge_id } : null;
}

export function forgetChallenge(store: Store, challengeId: string): void {
  store.db.prepare("delete from email_challenge where id = ?").run(challengeId);
  store.db.prepare("delete from dev_mailbox where challenge_id = ?").run(challengeId);
}

type CodeError = "invalid_code" | "expired" | "replay" | "locked";
type CodeResult = { ok: true } | { ok: false; error: CodeError };

function consumeCode(store: Store, email: string, code: string, now: number, secret: string): CodeResult {
  const row = one<{ id: string; code_mac: string; expires_at: string; attempts: number; consumed_at: string | null }>(
    store.db,
    "select id, code_mac, expires_at, attempts, consumed_at from email_challenge where email = ? order by sent_at desc limit 1",
    email,
  );
  if (!row) return { ok: false, error: "invalid_code" };
  if (row.consumed_at) return { ok: false, error: "replay" };
  if (Date.parse(row.expires_at) <= now) return { ok: false, error: "expired" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: "locked" };
  if (!macEqual(row.code_mac, codeMac(secret, row.id, email, code))) {
    store.db.prepare("update email_challenge set attempts = attempts + 1 where id = ? and consumed_at is null").run(row.id);
    return { ok: false, error: row.attempts + 1 >= MAX_ATTEMPTS ? "locked" : "invalid_code" };
  }
  const updated = store.db
    .prepare("update email_challenge set consumed_at = ? where id = ? and consumed_at is null and attempts < ?")
    .run(iso(now), row.id, MAX_ATTEMPTS);
  if (Number(updated.changes) !== 1) return { ok: false, error: "replay" };
  return { ok: true };
}

export function verifyEmail(
  store: Store,
  input: { email: string; code: string; now: number; secret: string },
): { ok: true; accountId: string; created: boolean } | { ok: false; error: CodeError | "invalid_email" } {
  const email = normalizeEmail(input.email);
  if (!email || input.secret.length < 16) return { ok: false, error: "invalid_code" };
  return immediate(store.db, () => {
    const consumed = consumeCode(store, email, input.code, input.now, input.secret);
    if (!consumed.ok) return consumed;
    const existing = one<Account>(store.db, "select * from site_account where email = ?", email);
    if (existing) return { ok: true as const, accountId: existing.id, created: false };
    const id = `acc_${randomUUID()}`;
    try {
      store.db
        .prepare("insert into site_account (id, email, email_verified_at, created_at) values (?, ?, ?, ?)")
        .run(id, email, iso(input.now), iso(input.now));
    } catch (error) {
      if (!unique(error)) throw error;
      const raced = one<Account>(store.db, "select * from site_account where email = ?", email);
      if (!raced) throw error;
      return { ok: true as const, accountId: raced.id, created: false };
    }
    return { ok: true as const, accountId: id, created: true };
  });
}

export function accountById(store: Store, id: string): Account | null {
  return one<Account>(store.db, "select * from site_account where id = ?", id) ?? null;
}

export function createSession(store: Store, accountId: string, now: number): { cookie: string; maxAge: number } {
  const cookie = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(cookie).digest("hex");
  store.db
    .prepare("insert into site_session (id_hash, account_id, expires_at) values (?, ?, ?)")
    .run(hash, accountId, iso(now + SESSION_SECONDS * 1000));
  return { cookie, maxAge: SESSION_SECONDS };
}

export function readSession(store: Store, cookie: string, now: number): Account | null {
  if (!cookie) return null;
  const hash = createHash("sha256").update(cookie).digest("hex");
  const row = one<{ account_id: string; expires_at: string }>(
    store.db,
    "select account_id, expires_at from site_session where id_hash = ?",
    hash,
  );
  if (!row || Date.parse(row.expires_at) <= now) return null;
  return accountById(store, row.account_id);
}

export function revokeSession(store: Store, cookie: string): void {
  if (!cookie) return;
  const hash = createHash("sha256").update(cookie).digest("hex");
  store.db.prepare("delete from site_session where id_hash = ?").run(hash);
}

export type ProofLogin =
  | { ok: true; accountId: string }
  | { ok: false; error: "bad_proof" | "expired" | "replay" | "vpn_unavailable" | "conflict" };

export function loginTelegramId(
  store: Store,
  input: { telegramId: string; proofHash: string; now: number; vpnDown: boolean; vpnRef: string | null },
): ProofLogin {
  const existing = one<Account>(store.db, "select * from site_account where telegram_id = ?", input.telegramId);
  if (input.vpnDown && !existing) return { ok: false, error: "vpn_unavailable" };
  return immediate(store.db, () => {
    try {
      store.db.prepare("insert into used_proof (hash, used_at) values (?, ?)").run(input.proofHash, iso(input.now));
    } catch (error) {
      if (unique(error)) return { ok: false as const, error: "replay" as const };
      throw error;
    }
    const current = one<Account>(store.db, "select * from site_account where telegram_id = ?", input.telegramId);
    if (current) {
      if (input.vpnRef && !current.vpn_user_ref) {
        try {
          store.db.prepare("update site_account set vpn_user_ref = ? where id = ? and vpn_user_ref is null").run(input.vpnRef, current.id);
        } catch (error) {
          if (!unique(error)) throw error;
        }
      }
      return { ok: true as const, accountId: current.id };
    }
    if (input.vpnDown) return { ok: false as const, error: "vpn_unavailable" as const };
    const id = `acc_${randomUUID()}`;
    const ref = input.vpnRef;
    try {
      store.db
        .prepare("insert into site_account (id, email, telegram_id, vpn_user_ref, created_at) values (?, null, ?, ?, ?)")
        .run(id, input.telegramId, ref, iso(input.now));
    } catch (error) {
      if (!unique(error)) throw error;
      const raced = one<Account>(store.db, "select * from site_account where telegram_id = ?", input.telegramId);
      if (raced) return { ok: true as const, accountId: raced.id };
      return { ok: false as const, error: "conflict" as const };
    }
    return { ok: true as const, accountId: id };
  });
}

export function loginWithProof(
  store: Store,
  input: {
    fields: Record<string, string>;
    now: number;
    doubleSecret: string | null;
    botToken: string | null;
    allowDouble: boolean;
    vpnDown: boolean;
    vpnRef: string | null;
  },
): ProofLogin {
  const proof = checkProof(input.fields, input);
  if (!proof.ok) return proof;
  return loginTelegramId(store, {
    telegramId: proof.id,
    proofHash: input.fields.hash,
    now: input.now,
    vpnDown: input.vpnDown,
    vpnRef: input.vpnRef,
  });
}

export function linkEmail(
  store: Store,
  input: { accountId: string; email: string; code: string; now: number; secret: string },
): { ok: true } | { ok: false; error: CodeError | "conflict" | "invalid_email" } {
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, error: "invalid_email" };
  return immediate(store.db, () => {
    const consumed = consumeCode(store, email, input.code, input.now, input.secret);
    if (!consumed.ok) return consumed;
    const owner = one<Account>(store.db, "select * from site_account where email = ?", email);
    const me = accountById(store, input.accountId);
    if (!me) return { ok: false as const, error: "conflict" as const };
    if (owner && owner.id !== me.id) return { ok: false as const, error: "conflict" as const };
    if (me.email && me.email !== email) return { ok: false as const, error: "conflict" as const };
    if (me.email === email) return { ok: true as const };
    store.db.prepare("update site_account set email = ?, email_verified_at = ? where id = ?").run(email, iso(input.now), me.id);
    return { ok: true as const };
  });
}

export function linkTelegramId(
  store: Store,
  input: { accountId: string; telegramId: string; proofHash: string; now: number; vpnRef: string | null },
): { ok: true; accountId: string } | { ok: false; error: "replay" | "conflict" } {
  return immediate(store.db, () => {
    try {
      store.db.prepare("insert into used_proof (hash, used_at) values (?, ?)").run(input.proofHash, iso(input.now));
    } catch (error) {
      if (unique(error)) return { ok: false as const, error: "replay" as const };
      throw error;
    }
    const me = accountById(store, input.accountId);
    const owner = one<Account>(store.db, "select * from site_account where telegram_id = ?", input.telegramId);
    if (!me) return { ok: false as const, error: "conflict" as const };
    if (owner && owner.id !== me.id) return { ok: false as const, error: "conflict" as const };
    if (me.telegram_id && me.telegram_id !== input.telegramId) return { ok: false as const, error: "conflict" as const };
    if (input.vpnRef && me.vpn_user_ref && input.vpnRef !== me.vpn_user_ref) return { ok: false as const, error: "conflict" as const };
    if (me.telegram_id === input.telegramId) return { ok: true as const, accountId: me.id };
    const ref = me.vpn_user_ref ?? input.vpnRef;
    try {
      store.db.prepare("update site_account set telegram_id = ?, vpn_user_ref = coalesce(vpn_user_ref, ?) where id = ?").run(input.telegramId, ref, me.id);
    } catch (error) {
      if (unique(error)) return { ok: false as const, error: "conflict" as const };
      throw error;
    }
    return { ok: true as const, accountId: me.id };
  });
}

export function linkTelegram(
  store: Store,
  input: {
    accountId: string;
    fields: Record<string, string>;
    now: number;
    doubleSecret: string | null;
    botToken: string | null;
    allowDouble: boolean;
    vpnRefForTelegram: string | null;
  },
): { ok: true; accountId: string } | { ok: false; error: "bad_proof" | "expired" | "replay" | "conflict" } {
  const proof = checkProof(input.fields, input);
  if (!proof.ok) return proof;
  return linkTelegramId(store, {
    accountId: input.accountId,
    telegramId: proof.id,
    proofHash: input.fields.hash,
    now: input.now,
    vpnRef: input.vpnRefForTelegram,
  });
}

export function unlinkEmail(store: Store, accountId: string): "ok" | "last_method" | "absent" {
  const me = accountById(store, accountId);
  if (!me?.email) return "absent";
  if (!me.telegram_id) return "last_method";
  store.db.prepare("update site_account set email = null, email_verified_at = null where id = ?").run(accountId);
  return "ok";
}

export function unlinkTelegram(store: Store, accountId: string): "ok" | "last_method" | "absent" {
  const me = accountById(store, accountId);
  if (!me?.telegram_id) return "absent";
  if (!me.email) return "last_method";
  store.db.prepare("update site_account set telegram_id = null where id = ?").run(accountId);
  return "ok";
}

export type OrderRow = {
  id: string;
  account_id: string;
  catalog_version: string;
  plan_id: string;
  term_months: number;
  amount_minor: number;
  currency: "RUB";
  kind: "new" | "renewal";
  status: string;
  idempotency_key: string;
  created_at: string;
  payment_status: string | null;
  payment_provider: string | null;
  paid_usdt: string | null;
  fulfillment_status: string | null;
};

export function createOrder(
  store: Store,
  input: {
    accountId: string;
    catalogVersion: string;
    planId: string;
    termMonths: number;
    amountMinor: number;
    kind: "new" | "renewal";
    idempotencyKey: string;
    now: number;
  },
): OrderRow | { error: "bad_key" | "conflict" } {
  if (!/^[A-Za-z0-9-]{16,64}$/.test(input.idempotencyKey)) return { error: "bad_key" };
  const existing = one<OrderRow>(
    store.db,
    "select *, null as payment_status, null as payment_provider, null as paid_usdt, null as fulfillment_status from site_order where idempotency_key = ?",
    input.idempotencyKey,
  );
  if (existing) return existing.account_id === input.accountId ? orderForAccount(store, input.accountId, existing.id)! : { error: "conflict" };
  const id = `ord_${randomUUID()}`;
  store.db
    .prepare(
      "insert into site_order (id, account_id, catalog_version, plan_id, term_months, amount_minor, currency, kind, status, idempotency_key, created_at) values (?, ?, ?, ?, ?, ?, 'RUB', ?, 'awaiting_payment', ?, ?)",
    )
    .run(id, input.accountId, input.catalogVersion, input.planId, input.termMonths, input.amountMinor, input.kind, input.idempotencyKey, iso(input.now));
  return orderForAccount(store, input.accountId, id)!;
}

export function orderById(store: Store, orderId: string): OrderRow | null {
  return one<OrderRow>(store.db, `${ORDER_LIST} where o.id = ?`, orderId) ?? null;
}

export function orderForAccount(store: Store, accountId: string, orderId: string): OrderRow | null {
  const order = orderById(store, orderId);
  return order && order.account_id === accountId ? order : null;
}

const ORDER_LIST = `select o.*,
       coalesce(p.status,
         case (
           select c.status from site_crypto_invoice c
           where c.order_id = o.id
           order by case c.status when 'paid' then 0 when 'review' then 1 when 'pending' then 2 when 'creating' then 3 else 4 end,
                    c.created_at desc
           limit 1
         )
           when 'paid' then 'succeeded'
           when 'review' then 'succeeded'
           when 'pending' then 'pending'
           when 'creating' then 'pending'
           when 'expired' then 'canceled'
           else null
         end
       ) as payment_status,
       coalesce(
         p.provider,
         (select 'cryptopay' from site_crypto_invoice c where c.order_id = o.id limit 1)
       ) as payment_provider,
       (
         select c.paid_amount from site_crypto_invoice c
         where c.order_id = o.id and c.paid_asset = 'USDT' and c.status = 'paid' and c.paid_amount is not null
         order by c.created_at desc
         limit 1
       ) as paid_usdt,
       f.status as fulfillment_status
       from site_order o
       left join site_payment p on p.order_id = o.id
       left join fulfillment f on f.order_id = o.id`;

export function listOrders(store: Store, accountId: string): OrderRow[] {
  return store.db
    .prepare(`${ORDER_LIST} where o.account_id = ? order by o.created_at desc, o.id desc`)
    .all(accountId) as unknown as OrderRow[];
}

const ORDER_PAGE = 10;

/** Stable pages. `at` is the cursor of this page; null is the first page. */
export function listOrderPage(
  store: Store,
  accountId: string,
  cursor: string | null,
  pageSize = ORDER_PAGE,
): { rows: OrderRow[]; next: string | null; prev: string | null; at: string | null } {
  const parsed = cursor && /^\d+$/.test(cursor) ? Number(cursor) : 0;
  const offset = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  const size = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : ORDER_PAGE;
  const rows = store.db
    .prepare(`${ORDER_LIST} where o.account_id = ? order by o.created_at desc, o.id desc limit ? offset ?`)
    .all(accountId, size + 1, offset) as unknown as OrderRow[];
  const more = rows.length > size;
  const page = more ? rows.slice(0, size) : rows;
  return {
    rows: page,
    next: more ? String(offset + size) : null,
    prev: offset === 0 ? null : String(Math.max(0, offset - size)),
    at: offset === 0 ? null : String(offset),
  };
}

export type PaymentRow = {
  id: string;
  order_id: string;
  provider: string;
  provider_payment_id: string | null;
  idempotency_key: string;
  amount_minor: number;
  currency: string;
  test: number | null;
  status: string;
  checkout_url: string | null;
  shop_id: string;
};

export function paymentByOrder(store: Store, orderId: string): PaymentRow | null {
  return one<PaymentRow>(store.db, "select * from site_payment where order_id = ?", orderId) ?? null;
}

export function insertPendingPayment(
  store: Store,
  input: { orderId: string; idempotencyKey: string; amountMinor: number; shopId: string },
): PaymentRow {
  const id = `pay_${randomUUID()}`;
  store.db
    .prepare(
      "insert into site_payment (id, order_id, provider, provider_payment_id, idempotency_key, amount_minor, currency, test, status, checkout_url, shop_id) values (?, ?, 'yookassa', null, ?, ?, 'RUB', null, 'pending', null, ?)",
    )
    .run(id, input.orderId, input.idempotencyKey, input.amountMinor, input.shopId);
  return paymentByOrder(store, input.orderId)!;
}

export function attachPayment(
  store: Store,
  orderId: string,
  input: { providerPaymentId: string; test: boolean; checkoutUrl: string | null },
): void {
  store.db
    .prepare("update site_payment set provider_payment_id = ?, test = ?, checkout_url = ? where order_id = ? and provider_payment_id is null")
    .run(input.providerPaymentId, input.test ? 1 : 0, input.checkoutUrl, orderId);
}

/** `between` throws after the paid writes and before the job insert, inside the transaction. */
export function markOrderPaid(store: Store, orderId: string, now: number, crash?: "between"): boolean {
  return immediate(store.db, () => {
    const order = one<{ status: string }>(store.db, "select status from site_order where id = ?", orderId);
    if (!order) return false;
    const existing = one<{ status: string }>(store.db, "select status from fulfillment where order_id = ?", orderId);
    if (existing?.status === "succeeded" || order.status === "active") return true;
    if (order.status !== "awaiting_payment" && order.status !== "paid") return false;
    if (order.status === "awaiting_payment") {
      store.db.prepare("update site_order set status = 'paid' where id = ? and status = 'awaiting_payment'").run(orderId);
      store.db.prepare("update site_payment set status = 'succeeded' where order_id = ?").run(orderId);
    }
    if (crash === "between") throw new Error("crash");
    if (!existing) {
      store.db.prepare("insert into fulfillment (order_id, status, attempts, updated_at) values (?, 'pending', 0, ?)").run(orderId, iso(now));
    }
    return false;
  });
}

export function cancelOrder(store: Store, orderId: string): void {
  store.db.prepare("update site_order set status = 'canceled' where id = ? and status = 'awaiting_payment'").run(orderId);
  store.db.prepare("update site_payment set status = 'canceled' where order_id = ?").run(orderId);
}

export type FulfillmentRow = {
  order_id: string;
  status: string;
  attempts: number;
  next_attempt_at: string | null;
  vpn_user_ref: string | null;
  last_error: string | null;
  updated_at: string;
};

export function dueFulfillments(store: Store, now: number): FulfillmentRow[] {
  return store.db
    .prepare("select * from fulfillment where status = 'pending' and (next_attempt_at is null or next_attempt_at <= ?)")
    .all(iso(now)) as unknown as FulfillmentRow[];
}

export function bumpFulfillment(store: Store, orderId: string, now: number, error: string): void {
  store.db
    .prepare("update fulfillment set attempts = attempts + 1, next_attempt_at = ?, last_error = ?, updated_at = ? where order_id = ? and status = 'pending'")
    .run(iso(now + 30_000), error, iso(now), orderId);
}

/** `between` throws after the grant row and before the order is closed, inside the transaction. */
export function finishFulfillment(store: Store, orderId: string, ref: string, now: number, crash?: "between"): void {
  immediate(store.db, () => {
    store.db
      .prepare("update fulfillment set status = 'succeeded', vpn_user_ref = ?, last_error = null, updated_at = ? where order_id = ?")
      .run(ref, iso(now), orderId);
    if (crash === "between") throw new Error("crash");
    store.db.prepare("update site_order set status = 'active' where id = ?").run(orderId);
    const order = orderById(store, orderId);
    if (order) {
      store.db.prepare("update site_account set vpn_user_ref = ? where id = ? and vpn_user_ref is null").run(ref, order.account_id);
    }
  });
}

/** Paid order with no job, or a succeeded grant whose order is still open. */
export function repairBilling(store: Store, now: number): { jobs: number; closed: number } {
  return immediate(store.db, () => {
    const missing = store.db
      .prepare(
        `select o.id as id from site_order o
         left join fulfillment f on f.order_id = o.id
         where o.status = 'paid' and f.order_id is null`,
      )
      .all() as unknown as { id: string }[];
    const insert = store.db.prepare("insert into fulfillment (order_id, status, attempts, updated_at) values (?, 'pending', 0, ?)");
    for (const row of missing) insert.run(row.id, iso(now));
    const open = store.db
      .prepare(
        `select f.order_id as order_id, f.vpn_user_ref as vpn_user_ref, o.account_id as account_id
         from fulfillment f join site_order o on o.id = f.order_id
         where f.status = 'succeeded' and o.status != 'active'`,
      )
      .all() as unknown as { order_id: string; vpn_user_ref: string | null; account_id: string }[];
    for (const row of open) {
      store.db.prepare("update site_order set status = 'active' where id = ?").run(row.order_id);
      if (row.vpn_user_ref) {
        store.db.prepare("update site_account set vpn_user_ref = ? where id = ? and vpn_user_ref is null").run(row.vpn_user_ref, row.account_id);
      }
    }
    return { jobs: missing.length, closed: open.length };
  });
}

export function failFulfillment(store: Store, orderId: string, error: string, now: number): void {
  store.db
    .prepare("update fulfillment set status = 'failed', last_error = ?, updated_at = ? where order_id = ?")
    .run(error, iso(now), orderId);
}

export function requeueFulfillment(store: Store, orderId: string, now: number): boolean {
  const row = one<FulfillmentRow>(store.db, "select * from fulfillment where order_id = ?", orderId);
  if (!row || row.status === "succeeded") return false;
  store.db
    .prepare("update fulfillment set status = 'pending', next_attempt_at = null, last_error = null, updated_at = ? where order_id = ?")
    .run(iso(now), orderId);
  return true;
}

export function fulfillmentOf(store: Store, orderId: string): FulfillmentRow | null {
  return one<FulfillmentRow>(store.db, "select * from fulfillment where order_id = ?", orderId) ?? null;
}

export function ownedOrder(store: Store, accountId: string, orderId: string): OrderRow | null {
  const order = orderById(store, orderId);
  if (!order || order.account_id !== accountId) return null;
  return order;
}

export function attachVpnRef(store: Store, accountId: string, ref: string): { ok: true } | { ok: false; error: "conflict" } {
  const owner = one<{ id: string }>(store.db, "select id from site_account where vpn_user_ref = ?", ref);
  if (owner && owner.id !== accountId) return { ok: false, error: "conflict" };
  const me = accountById(store, accountId);
  if (!me) return { ok: false, error: "conflict" };
  if (me.vpn_user_ref && me.vpn_user_ref !== ref) return { ok: false, error: "conflict" };
  if (me.vpn_user_ref === ref) return { ok: true };
  try {
    store.db.prepare("update site_account set vpn_user_ref = ? where id = ? and vpn_user_ref is null").run(ref, accountId);
  } catch (error) {
    if (unique(error)) return { ok: false, error: "conflict" };
    throw error;
  }
  return { ok: true };
}

export type CryptoInvoiceRow = {
  id: string;
  order_id: string;
  provider_payment_id: string | null;
  idempotency_key: string;
  amount_minor: number;
  currency: string;
  test: number | null;
  status: string;
  checkout_url: string | null;
  paid_asset: string | null;
  paid_amount: string | null;
  created_at: string;
};

export function cryptoById(store: Store, id: string): CryptoInvoiceRow | null {
  return one<CryptoInvoiceRow>(store.db, "select * from site_crypto_invoice where id = ?", id) ?? null;
}

export function cryptoByInvoice(store: Store, invoiceId: string): CryptoInvoiceRow | null {
  return one<CryptoInvoiceRow>(store.db, "select * from site_crypto_invoice where provider = 'cryptopay' and provider_payment_id = ?", invoiceId) ?? null;
}

export function cryptoForOrder(store: Store, orderId: string): CryptoInvoiceRow[] {
  return store.db
    .prepare("select * from site_crypto_invoice where order_id = ? order by created_at asc, id asc")
    .all(orderId) as unknown as CryptoInvoiceRow[];
}

export function openCryptoInvoices(store: Store): CryptoInvoiceRow[] {
  return store.db
    .prepare(
      `select c.* from site_crypto_invoice c
       join site_order o on o.id = c.order_id
       where c.provider_payment_id is not null
         and c.status in ('creating', 'pending', 'expired', 'paid')
         and o.status = 'awaiting_payment'`,
    )
    .all() as unknown as CryptoInvoiceRow[];
}

/**
 * One in-flight attempt per order. Age does not open another invoice:
 * a lost create response is resolved by the saved payload, not by a timer.
 */
export function beginCryptoAttempt(
  store: Store,
  input: { orderId: string; amountMinor: number; now: number },
): { row: CryptoInvoiceRow; fresh: boolean } {
  return immediate(store.db, () => {
    const open = one<CryptoInvoiceRow>(
      store.db,
      `select * from site_crypto_invoice
       where order_id = ? and status in ('creating', 'pending')
       order by created_at desc limit 1`,
      input.orderId,
    );
    if (open) return { row: open, fresh: false };
    const id = `cinv_${randomUUID()}`;
    store.db
      .prepare(
        `insert into site_crypto_invoice
         (id, order_id, provider, provider_payment_id, idempotency_key, amount_minor, currency, test, status, checkout_url, paid_asset, paid_amount, created_at)
         values (?, ?, 'cryptopay', null, ?, ?, 'RUB', null, 'creating', null, null, null, ?)`,
      )
      .run(id, input.orderId, id, input.amountMinor, iso(input.now));
    return { row: cryptoById(store, id)!, fresh: true };
  });
}

/** Only after getInvoices confirms the payload is absent and no provider id was stored. */
export function retireCryptoAttempt(store: Store, id: string): void {
  store.db
    .prepare(
      `update site_crypto_invoice set status = 'absent'
       where id = ? and provider_payment_id is null and status in ('creating', 'pending')`,
    )
    .run(id);
}

/**
 * Invoice, order, and the fulfillment job commit together.
 * A thrown error rolls all three back. Network calls stay outside.
 */
export function commitCryptoPaid(
  store: Store,
  input: {
    attemptId: string;
    now: number;
    invoiceId: string;
    checkoutUrl: string | null;
    test: boolean;
    paidAsset: string | null;
    paidAmount: string | null;
  },
): { duplicate: boolean; review: boolean } {
  return immediate(store.db, () => {
    const attempt = one<CryptoInvoiceRow>(store.db, "select * from site_crypto_invoice where id = ?", input.attemptId);
    const order = one<{ status: string }>(store.db, "select status from site_order where id = ?", attempt?.order_id ?? "");
    if (!attempt || !order) return { duplicate: false, review: true };
    const job = one<{ status: string }>(store.db, "select status from fulfillment where order_id = ?", attempt.order_id);
    const already = order.status === "active" || order.status === "paid" || job?.status === "succeeded";
    const status = already && attempt.status !== "paid" ? "review" : "paid";
    store.db
      .prepare(
        `update site_crypto_invoice
         set provider_payment_id = ?, checkout_url = coalesce(?, checkout_url), test = ?, status = ?, paid_asset = ?, paid_amount = ?
         where id = ?`,
      )
      .run(input.invoiceId, input.checkoutUrl, input.test ? 1 : 0, status, input.paidAsset, input.paidAmount, attempt.id);
    if (already) return { duplicate: true, review: true };
    store.db.prepare("update site_order set status = 'paid' where id = ? and status = 'awaiting_payment'").run(attempt.order_id);
    if (!job) {
      store.db.prepare("insert into fulfillment (order_id, status, attempts, updated_at) values (?, 'pending', 0, ?)").run(attempt.order_id, iso(input.now));
    }
    return { duplicate: false, review: false };
  });
}

export function attachCryptoInvoice(
  store: Store,
  id: string,
  input: { invoiceId: string; checkoutUrl: string | null; test: boolean; status: string; paidAsset: string | null; paidAmount: string | null },
): void {
  store.db
    .prepare(
      `update site_crypto_invoice
       set provider_payment_id = ?, checkout_url = coalesce(?, checkout_url), test = ?, status = ?, paid_asset = ?, paid_amount = ?
       where id = ?`,
    )
    .run(input.invoiceId, input.checkoutUrl, input.test ? 1 : 0, input.status, input.paidAsset, input.paidAmount, id);
}

export function openPayments(store: Store): { orderId: string; providerPaymentId: string }[] {
  const rows = store.db
    .prepare(
      `select p.order_id as order_id, p.provider_payment_id as provider_payment_id
       from site_payment p join site_order o on o.id = p.order_id
       where o.status = 'awaiting_payment' and p.provider_payment_id is not null`,
    )
    .all() as unknown as { order_id: string; provider_payment_id: string }[];
  return rows.map((row) => ({ orderId: row.order_id, providerPaymentId: row.provider_payment_id }));
}
