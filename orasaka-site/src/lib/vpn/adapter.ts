import type { Account, Store } from "../server/store";

export type VpnDevice = {
  id: string;
  label: string;
  lastActiveAt: string | null;
  /** null means this row has no online measurement. */
  online: boolean | null;
};

export type VpnPurchase = {
  id: string;
  /** Site order id when this row is the same purchase. The bot row id is not that id. */
  orderId: string | null;
  amountMinor: number;
  currency: string;
  termMonths: number | null;
  paidAt: string;
  status: string;
};

export type VpnDownReason = "unconfigured" | "down" | "timeout" | "bad_response" | "forbidden";

export type VpnUser = {
  ref: string;
  expiresAt: string | null;
  termMonths: number | null;
  connectionUrl: string | null;
  subscriptionId?: string | null;
  deviceLimit?: number | null;
  devices?: VpnDevice[] | null;
  devicesError?: boolean;
  /** Missing on the isolated double, which is not the device API. */
  online?: "known" | "unknown" | "unavailable";
  purchases?: VpnPurchase[] | null;
  purchasesError?: boolean;
  purchasesBoundary?: string | null;
  purchaseCursor?: string | null;
  purchasePrev?: string | null;
  subError?: boolean;
};

export type VpnSnapshot =
  | { down: true; reason: VpnDownReason }
  | { down: false; user: null; source?: "http" }
  | { down: false; user: VpnUser; source?: "http" };

export type GrantInput = {
  orderId: string;
  accountId: string;
  telegramId: string | null;
  email?: string | null;
  termMonths: number;
  now: number;
};

export type GrantResult =
  | { ok: true; ref: string; expiresAt: string; termMonths: number; connectionUrl: string }
  | { ok: false; down: true }
  | { ok: false; conflict: true }
  | { ok: false; durationUnconfigured: true };

export type PurchasePage =
  | { ok: true; items: VpnPurchase[]; cursor: string | null; prev: string | null; boundary: string | null }
  | { ok: false };

export type RevokeResult = { ok: true } | { ok: false; error: "not_found" | "forbidden" | "down" };

export type VpnAdapter = {
  /** isolated-test-double and contract-stand are not the live bot and not Remnawave. */
  label: "isolated-test-double" | "unconfigured" | "contract-stand";
  readAccount(store: Store, account: Account): VpnSnapshot | Promise<VpnSnapshot>;
  grant(store: Store, input: GrantInput): GrantResult | Promise<GrantResult>;
  listPurchases?(ref: string, cursor: string | null): Promise<PurchasePage>;
  revokeDevice?(ref: string, deviceId: string): Promise<RevokeResult>;
};

type DoubleUser = {
  ref: string;
  telegram_id: string | null;
  expires_at: string | null;
  term_months: number | null;
  connection_url: string | null;
};

function doubleUser(store: Store, ref: string): DoubleUser | undefined {
  return store.db.prepare("select * from double_vpn_user where ref = ?").get(ref) as DoubleUser | undefined;
}

export function doubleIsDown(store: Store): boolean {
  const row = store.db.prepare("select down from double_control where id = 1").get() as { down: number } | undefined;
  return row?.down === 1;
}

export function setDoubleDown(store: Store, down: boolean): void {
  store.db.prepare("update double_control set down = ? where id = 1").run(down ? 1 : 0);
}

export function seedDouble(store: Store, now: number): void {
  const insert = store.db.prepare(
    "insert into double_vpn_user (ref, telegram_id, expires_at, term_months, connection_url, username) values (?, ?, ?, ?, ?, ?) on conflict (ref) do nothing",
  );
  const day = 24 * 60 * 60 * 1000;
  insert.run("vpn_double_1001", "1001", new Date(now + 20 * day).toISOString(), 1, "test-double://sub/vpn_double_1001", "paid_user");
  insert.run("vpn_double_1002", "1002", new Date(now - 2 * day).toISOString(), 1, "test-double://sub/vpn_double_1002", "expired_user");
}

export function doubleRefForTelegram(store: Store, telegramId: string): string | null {
  const row = store.db.prepare("select ref from double_vpn_user where telegram_id = ?").get(telegramId) as { ref: string } | undefined;
  return row?.ref ?? null;
}

function snapshot(user: DoubleUser | undefined): VpnSnapshot {
  if (!user) return { down: false, user: null };
  return {
    down: false,
    user: { ref: user.ref, expiresAt: user.expires_at, termMonths: user.term_months, connectionUrl: user.connection_url },
  };
}

export function doubleAdapter() {
  return {
    label: "isolated-test-double",
    readAccount(store, account) {
      if (doubleIsDown(store) && (account.telegram_id || account.vpn_user_ref)) return { down: true, reason: "down" };
      if (account.vpn_user_ref) return snapshot(doubleUser(store, account.vpn_user_ref));
      if (account.telegram_id) return snapshot(doubleUserByTelegram(store, account.telegram_id));
      return { down: false, user: null };
    },
    grant(store, input) {
      if (doubleIsDown(store)) return { ok: false, down: true };
      store.db.exec("BEGIN IMMEDIATE");
      return grantBody(store, input);
    },
  } satisfies VpnAdapter;
}

function doubleUserByTelegram(store: Store, telegramId: string): DoubleUser | undefined {
  return store.db.prepare("select * from double_vpn_user where telegram_id = ?").get(telegramId) as DoubleUser | undefined;
}

function grantBody(store: Store, input: GrantInput): GrantResult {
  try {
    const prior = store.db.prepare("select ref from double_grant where order_id = ?").get(input.orderId) as { ref: string } | undefined;
    if (prior) {
      const user = doubleUser(store, prior.ref);
      store.db.exec("COMMIT");
      if (!user?.expires_at || !user.connection_url) return { ok: false, conflict: true };
      return { ok: true, ref: user.ref, expiresAt: user.expires_at, termMonths: user.term_months ?? input.termMonths, connectionUrl: user.connection_url };
    }
    const byTelegram = input.telegramId ? doubleUserByTelegram(store, input.telegramId) : undefined;
    const account = store.db.prepare("select vpn_user_ref from site_account where id = ?").get(input.accountId) as { vpn_user_ref: string | null } | undefined;
    if (byTelegram && account?.vpn_user_ref && byTelegram.ref !== account.vpn_user_ref) {
      store.db.exec("COMMIT");
      return { ok: false, conflict: true };
    }
    let ref = account?.vpn_user_ref ?? byTelegram?.ref ?? null;
    let user = ref ? doubleUser(store, ref) : undefined;
    if (!user) {
      ref = `vpn_double_${input.accountId}`;
      const url = `test-double://sub/${ref}`;
      store.db
        .prepare("insert into double_vpn_user (ref, telegram_id, expires_at, term_months, connection_url, username) values (?, ?, null, null, ?, null)")
        .run(ref, input.telegramId, url);
      user = doubleUser(store, ref);
    }
    if (!user || !ref) {
      store.db.exec("ROLLBACK");
      return { ok: false, conflict: true };
    }
    // ponytail: 30-day blocks exist only in this isolated double so a test can prove one renewal.
    // Not a production month rule. The unconfigured adapter does not add time.
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    const current = user.expires_at ? Date.parse(user.expires_at) : 0;
    const expiresAt = new Date(Math.max(current, input.now) + input.termMonths * monthMs).toISOString();
    store.db
      .prepare("update double_vpn_user set expires_at = ?, term_months = ? where ref = ?")
      .run(expiresAt, input.termMonths, ref);
    store.db.prepare("insert into double_grant (order_id, ref, granted_at) values (?, ?, ?)").run(input.orderId, ref, new Date(input.now).toISOString());
    store.db.exec("COMMIT");
    return { ok: true, ref, expiresAt, termMonths: input.termMonths, connectionUrl: user.connection_url ?? `test-double://sub/${ref}` };
  } catch (error) {
    try {
      store.db.exec("ROLLBACK");
    } catch {
      /* already closed */
    }
    throw error;
  }
}

export function unconfiguredAdapter() {
  return {
    label: "unconfigured",
    readAccount(store, account) {
      void store;
      void account;
      return { down: true, reason: "unconfigured" as const };
    },
    grant(store, input) {
      void store;
      void input;
      return { ok: false, down: true as const };
    },
  } satisfies VpnAdapter;
}

export function countDoubleUsers(store: Store): number {
  const row = store.db.prepare("select count(*) as n from double_vpn_user").get() as { n: number };
  return row.n;
}

export function countDoubleGrants(store: Store, orderId?: string): number {
  if (orderId) {
    const row = store.db.prepare("select count(*) as n from double_grant where order_id = ?").get(orderId) as { n: number };
    return row.n;
  }
  const row = store.db.prepare("select count(*) as n from double_grant").get() as { n: number };
  return row.n;
}
