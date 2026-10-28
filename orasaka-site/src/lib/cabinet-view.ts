import type { Locale } from "@/lib/i18n/locale";
import type { VpnDevice, VpnPurchase, VpnSnapshot } from "./vpn/adapter";
import { CABINET_COPY, formatExpiry, remainingLabel } from "./cabinet-copy";
import { listOrders, type Account, type OrderRow, type Store } from "./server/store";

export { CABINET_COPY, formatExpiry, remainingLabel };

export type CabinetState = "none" | "active" | "expired" | "unavailable";
export type RenewalState = "none" | "preparing" | "failed";

export type CabinetView = {
  email: string | null;
  telegramLinked: boolean;
  state: CabinetState;
  vpnReason: "ok" | "down" | "unconfigured" | "timeout" | "bad_response" | "forbidden";
  renewal: RenewalState;
  expiresAt: string | null;
  expiryLabel: string | null;
  remaining: string | null;
  termMonths: number | null;
  connectionUrl: string | null;
  subscriptionId: string | null;
  orders: OrderRow[];
  /** Every site order id, including ones outside the current page. Dedup uses this, not the bot row id. */
  orderIds: string[];
  orderNext: string | null;
  orderPrev: string | null;
  orderAt: string | null;
  devices: VpnDevice[] | null;
  devicesError: boolean;
  deviceLimit: number | null;
  online: "known" | "unknown" | "unavailable" | "unconfigured";
  botPurchases: VpnPurchase[] | null;
  botPurchasesError: boolean;
  botBoundary: string | null;
  purchaseCursor: string | null;
  purchasePrev: string | null;
  purchaseAt: string | null;
};

const UNCONFIGURED_ACCESS = {
  subscriptionId: null,
  devices: null as VpnDevice[] | null,
  devicesError: false,
  deviceLimit: null,
  online: "unconfigured" as const,
  botPurchases: null as VpnPurchase[] | null,
  botPurchasesError: false,
  botBoundary: "unconfigured",
  purchaseCursor: null,
  purchasePrev: null,
};

const FAILED_ACCESS = {
  ...UNCONFIGURED_ACCESS,
  devicesError: true,
  online: "unavailable" as const,
  botPurchasesError: true,
  botBoundary: null,
};

const EMPTY_HTTP_ACCESS = {
  subscriptionId: null,
  devices: [] as VpnDevice[],
  devicesError: false,
  deviceLimit: null,
  online: "known" as const,
  botPurchases: [] as VpnPurchase[],
  botPurchasesError: false,
  botBoundary: null,
  purchaseCursor: null,
  purchasePrev: null,
};

function accessFrom(vpn: VpnSnapshot) {
  if (vpn.down) return vpn.reason === "unconfigured" ? UNCONFIGURED_ACCESS : FAILED_ACCESS;
  if (!vpn.user) return vpn.source === "http" ? EMPTY_HTTP_ACCESS : UNCONFIGURED_ACCESS;
  const user = vpn.user;
  if (user.devices === undefined && user.purchases === undefined) return UNCONFIGURED_ACCESS;
  return {
    subscriptionId: user.subscriptionId ?? null,
    devices: user.devicesError ? null : (user.devices ?? null),
    devicesError: Boolean(user.devicesError),
    deviceLimit: user.deviceLimit ?? null,
    online: user.devicesError ? ("unavailable" as const) : (user.online ?? "unknown"),
    botPurchases: user.purchasesError ? null : (user.purchases ?? null),
    botPurchasesError: Boolean(user.purchasesError),
    botBoundary: user.purchasesError ? null : (user.purchasesBoundary ?? null),
    purchaseCursor: user.purchaseCursor ?? null,
    purchasePrev: user.purchasesError ? null : (user.purchasePrev ?? null),
  };
}

export function resolvedVpnRef(account: { vpn_user_ref: string | null }, vpn: VpnSnapshot): string | null {
  if (!vpn.down && vpn.user?.ref) return vpn.user.ref;
  return account.vpn_user_ref;
}

export function buildCabinet(store: Store, account: Account, vpn: VpnSnapshot, now: number, locale: Locale = "ru"): CabinetView {
  const orders = listOrders(store, account.id);
  const renewal: RenewalState = orders.some((order) => order.status === "paid" && order.fulfillment_status === "pending")
    ? "preparing"
    : orders.some((order) => order.status === "paid" && order.fulfillment_status === "failed")
      ? "failed"
      : "none";
  const access = accessFrom(vpn);
  const base = {
    email: account.email,
    telegramLinked: Boolean(account.telegram_id),
    orders,
    orderIds: orders.map((order) => order.id),
    orderNext: null,
    orderPrev: null,
    orderAt: null,
    purchaseAt: null,
    renewal,
    connectionUrl: null as string | null,
    vpnReason: "ok" as const,
    ...access,
  };
  if (vpn.down) {
    return { ...base, state: "unavailable", vpnReason: vpn.reason, expiresAt: null, expiryLabel: null, remaining: null, termMonths: null };
  }
  const user = vpn.user;
  if (user?.subError) {
    return { ...base, state: "unavailable", vpnReason: "bad_response", expiresAt: null, expiryLabel: null, remaining: null, termMonths: null };
  }
  if (!user?.expiresAt) return { ...base, state: "none", expiresAt: null, expiryLabel: null, remaining: null, termMonths: null };
  const expiryLabel = formatExpiry(user.expiresAt, locale);
  if (Date.parse(user.expiresAt) <= now) {
    return { ...base, state: "expired", expiresAt: user.expiresAt, expiryLabel, remaining: null, termMonths: user.termMonths, subscriptionId: user.subscriptionId ?? null };
  }
  return {
    ...base,
    state: "active",
    expiresAt: user.expiresAt,
    expiryLabel,
    remaining: remainingLabel(user.expiresAt, now, locale),
    termMonths: user.termMonths,
    connectionUrl: user.connectionUrl,
    subscriptionId: user.subscriptionId ?? access.subscriptionId,
  };
}
