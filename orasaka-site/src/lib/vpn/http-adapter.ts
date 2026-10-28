import type { Account, Store } from "../server/store";
import { envGet } from "../server/env-get";
import { siteProfile } from "../server/profile";
import {
  doubleAdapter,
  doubleIsDown,
  doubleRefForTelegram,
  unconfiguredAdapter,
  type GrantInput,
  type GrantResult,
  type PurchasePage,
  type RevokeResult,
  type VpnAdapter,
  type VpnDevice,
  type VpnDownReason,
  type VpnPurchase,
  type VpnSnapshot,
  type VpnUser,
} from "./adapter";
import { configuredDurationRule, type DurationRule } from "./duration-rule";

export type HttpVpnConfig = {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  /** calendar-months / fixed-day-blocks, or isolated test-30-day-blocks. Empty/unknown → null. */
  durationRule: DurationRule | null;
};

type Call = { ok: true; status: number; body: unknown } | { ok: false; reason: VpnDownReason };

export function readHttpVpnConfig(): HttpVpnConfig | null {
  const baseUrl = envGet("VPN_BASE_URL");
  const token = envGet("VPN_API_TOKEN");
  if (!baseUrl || !token) return null;
  const rawTimeout = Number(envGet("VPN_TIMEOUT_MS") ?? "4000");
  const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout >= 200 && rawTimeout <= 20_000 ? rawTimeout : 4000;
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    token,
    timeoutMs,
    durationRule: configuredDurationRule(),
  };
}

export function currentAdapter(): VpnAdapter {
  if (siteProfile() === "isolated" && envGet("VPN_MODE") === "double") return doubleAdapter();
  const cfg = readHttpVpnConfig();
  return cfg ? httpAdapter(cfg) : unconfiguredAdapter();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function call(cfg: HttpVpnConfig, path: string, init?: { method?: string; body?: unknown }): Promise<Call> {
  try {
    const response = await fetch(`${cfg.baseUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        authorization: `Bearer ${cfg.token}`,
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
    if (response.status === 401 || response.status === 403) return { ok: false, reason: "forbidden" };
    if (response.status === 204) return { ok: true, status: 204, body: null };
    const text = await response.text();
    let body: unknown;
    try {
      body = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      return { ok: false, reason: "bad_response" };
    }
    if (response.status >= 500) return { ok: false, reason: "down" };
    return { ok: true, status: response.status, body };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") return { ok: false, reason: "timeout" };
    return { ok: false, reason: "down" };
  }
}

function errorCode(body: unknown): string | null {
  return isRecord(body) && typeof body.error === "string" ? body.error : null;
}

export async function lookupVpnUser(
  cfg: HttpVpnConfig,
  query: { telegramId?: string | null; email?: string | null; id?: string | null },
): Promise<{ kind: "error"; reason: VpnDownReason } | { kind: "ok"; id: string | null }> {
  const params = new URLSearchParams();
  if (query.id) params.set("id", query.id);
  else if (query.telegramId) params.set("telegram_id", query.telegramId);
  else if (query.email) params.set("email", query.email);
  else return { kind: "ok", id: null };
  const result = await call(cfg, `/v1/users?${params.toString()}`);
  if (!result.ok) return { kind: "error", reason: result.reason };
  if (result.status !== 200 || !isRecord(result.body) || !("user" in result.body)) return { kind: "error", reason: "bad_response" };
  if (result.body.user === null) return { kind: "ok", id: null };
  if (!isRecord(result.body.user) || typeof result.body.user.id !== "string") return { kind: "error", reason: "bad_response" };
  return { kind: "ok", id: result.body.user.id };
}

/** Login and sync only look up. They do not create a VPN user. */
export async function resolveTelegramVpn(store: Store, telegramId: string): Promise<{ down: boolean; ref: string | null }> {
  if (siteProfile() === "isolated" && envGet("VPN_MODE") === "double") {
    if (doubleIsDown(store)) return { down: true, ref: null };
    return { down: false, ref: doubleRefForTelegram(store, telegramId) };
  }
  const cfg = readHttpVpnConfig();
  if (!cfg) return { down: true, ref: null };
  const found = await lookupVpnUser(cfg, { telegramId });
  if (found.kind === "error") return { down: true, ref: null };
  return { down: false, ref: found.id };
}

const PURCHASE_STATUS = new Set(["pending", "succeeded", "canceled"]);
const SUB_STATUS = new Set(["active", "expired", "none"]);

function dateString(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 4 || value.length > 40) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? value : null;
}

function whole(value: unknown, min: number): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) return null;
  return value;
}

/** null stays null. A bad number is undefined so the caller can fail that section. */
function nullableWhole(value: unknown, min: number): number | null | undefined {
  if (value === null) return null;
  const parsed = whole(value, min);
  return parsed === null ? undefined : parsed;
}

function cursorField(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : undefined;
}

function parsePurchase(value: unknown): VpnPurchase | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id) return null;
  const amount = whole(value.amount_minor, 0);
  const paidAt = dateString(value.paid_at);
  const term = nullableWhole(value.term_months, 1);
  if (amount === null || value.currency !== "RUB" || !paidAt || term === undefined) return null;
  if (typeof value.status !== "string" || !PURCHASE_STATUS.has(value.status)) return null;
  if (value.order_id !== null && value.order_id !== undefined && typeof value.order_id !== "string") return null;
  return {
    id: value.id,
    orderId: typeof value.order_id === "string" ? value.order_id : null,
    amountMinor: amount,
    currency: "RUB",
    termMonths: term,
    paidAt,
    status: value.status,
  };
}

function parseDevice(value: unknown): VpnDevice | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id || typeof value.label !== "string" || !value.label) return null;
  const lastActiveAt = value.last_active_at === null ? null : dateString(value.last_active_at);
  if (value.last_active_at !== null && !lastActiveAt) return null;
  if (value.online !== null && typeof value.online !== "boolean") return null;
  return { id: value.id, label: value.label, lastActiveAt, online: typeof value.online === "boolean" ? value.online : null };
}

async function readUser(cfg: HttpVpnConfig, ref: string): Promise<VpnSnapshot> {
  const [sub, buys, devices] = await Promise.all([
    call(cfg, `/v1/users/${encodeURIComponent(ref)}/subscription`),
    call(cfg, `/v1/users/${encodeURIComponent(ref)}/purchases`),
    call(cfg, `/v1/users/${encodeURIComponent(ref)}/devices`),
  ]);
  if (!sub.ok && !buys.ok && !devices.ok) return { down: true, reason: sub.reason };
  const user: VpnUser = {
    ref,
    expiresAt: null,
    termMonths: null,
    connectionUrl: null,
    subscriptionId: null,
    deviceLimit: null,
    devices: null,
    devicesError: !devices.ok,
    online: devices.ok ? "unknown" : "unavailable",
    purchases: null,
    purchasesError: !buys.ok,
    purchasesBoundary: null,
    purchaseCursor: null,
    purchasePrev: null,
    subError: !sub.ok,
  };
  if (sub.ok && sub.status === 404) {
    user.subError = false;
  } else if (sub.ok && sub.status === 200 && isRecord(sub.body) && typeof sub.body.id === "string" && sub.body.id && SUB_STATUS.has(String(sub.body.status)) && isRecord(sub.body.limits) && isRecord(sub.body.connection)) {
    const expires = sub.body.expires_at === null ? null : dateString(sub.body.expires_at);
    const term = nullableWhole(sub.body.term_months, 1);
    const limit = nullableWhole(sub.body.limits.device_limit, 0);
    const url = sub.body.connection.url;
    const badDate = sub.body.expires_at !== null && expires === null;
    const badUrl = url !== null && typeof url !== "string";
    if (badDate || term === undefined || limit === undefined || badUrl) user.subError = true;
    else {
      user.subError = false;
      user.subscriptionId = sub.body.id;
      user.expiresAt = expires;
      user.termMonths = term;
      user.deviceLimit = limit;
      user.connectionUrl = typeof url === "string" ? url : null;
    }
  } else if (sub.ok) user.subError = true;
  if (buys.ok && buys.status === 200 && isRecord(buys.body) && Array.isArray(buys.body.items)) {
    const items = buys.body.items.map(parsePurchase);
    const next = cursorField(buys.body.next_cursor);
    const prev = cursorField(buys.body.prev_cursor);
    const boundary = buys.body.boundary;
    const badBoundary = boundary !== null && boundary !== undefined && typeof boundary !== "string";
    if (items.some((item) => !item) || next === undefined || prev === undefined || badBoundary) user.purchasesError = true;
    else {
      user.purchases = items as VpnPurchase[];
      user.purchasesError = false;
      user.purchaseCursor = next;
      user.purchasePrev = prev;
      user.purchasesBoundary = typeof boundary === "string" ? boundary : null;
    }
  } else if (buys.ok) user.purchasesError = true;
  if (devices.ok && devices.status === 200 && isRecord(devices.body) && Array.isArray(devices.body.items) && (devices.body.online === "known" || devices.body.online === "unknown")) {
    const items = devices.body.items.map(parseDevice);
    const limit = nullableWhole(devices.body.limit === undefined ? null : devices.body.limit, 0);
    if (items.some((item) => !item) || limit === undefined) user.devicesError = true;
    else {
      user.devices = items as VpnDevice[];
      user.devicesError = false;
      user.online = devices.body.online;
      user.deviceLimit = limit;
    }
  } else if (devices.ok) user.devicesError = true;
  return { down: false, user, source: "http" };
}

export function httpAdapter(cfg: HttpVpnConfig): VpnAdapter {
  return {
    label: "contract-stand",
    async readAccount(_store: Store, account: Account): Promise<VpnSnapshot> {
      let ref = account.vpn_user_ref;
      if (!ref && (account.telegram_id || account.email)) {
        const found = await lookupVpnUser(cfg, { telegramId: account.telegram_id, email: account.vpn_user_ref ? null : account.email });
        if (found.kind === "error") return { down: true, reason: found.reason };
        ref = found.id;
      }
      if (!ref) return { down: false, user: null, source: "http" };
      return readUser(cfg, ref);
    },
    async grant(_store: Store, input: GrantInput): Promise<GrantResult> {
      const result = await call(cfg, "/v1/grants", {
        method: "POST",
        body: {
          order_id: input.orderId,
          site_account_id: input.accountId,
          telegram_id: input.telegramId,
          email: input.email ?? null,
          term_months: input.termMonths,
          duration_rule: cfg.durationRule,
        },
      });
      if (!result.ok) return { ok: false, down: true };
      const code = errorCode(result.body);
      if (result.status === 409 && code === "duration_unconfigured") return { ok: false, durationUnconfigured: true };
      if (result.status === 409 && code === "conflict") return { ok: false, conflict: true };
      if (result.status !== 200 || !isRecord(result.body)) return { ok: false, down: true };
      const { ref, expires_at: expiresAt, term_months: termMonths, connection_url: connectionUrl } = result.body;
      if (typeof ref !== "string" || typeof expiresAt !== "string" || typeof termMonths !== "number" || typeof connectionUrl !== "string") {
        return { ok: false, down: true };
      }
      return { ok: true, ref, expiresAt, termMonths, connectionUrl };
    },
    async listPurchases(ref: string, cursor: string | null): Promise<PurchasePage> {
      const path = `/v1/users/${encodeURIComponent(ref)}/purchases${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
      const result = await call(cfg, path);
      if (!result.ok || result.status !== 200 || !isRecord(result.body) || !Array.isArray(result.body.items)) return { ok: false };
      const items = result.body.items.map(parsePurchase);
      const next = cursorField(result.body.next_cursor);
      const prev = cursorField(result.body.prev_cursor);
      const boundary = result.body.boundary;
      const badBoundary = boundary !== null && boundary !== undefined && typeof boundary !== "string";
      if (items.some((item) => !item) || next === undefined || prev === undefined || badBoundary) return { ok: false };
      return {
        ok: true,
        items: items as VpnPurchase[],
        cursor: next,
        prev,
        boundary: typeof boundary === "string" ? boundary : null,
      };
    },
    async revokeDevice(ref: string, deviceId: string): Promise<RevokeResult> {
      const result = await call(cfg, `/v1/users/${encodeURIComponent(ref)}/devices/${encodeURIComponent(deviceId)}/revoke`, { method: "POST", body: {} });
      if (!result.ok) return { ok: false, error: result.reason === "forbidden" ? "forbidden" : "down" };
      if (result.status === 404) return { ok: false, error: "not_found" };
      if (result.status === 200) return { ok: true };
      return { ok: false, error: "down" };
    },
  };
}
