import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { envGet } from "../server/env-get";
import { siteProfile } from "../server/profile";

export type CryptoMode = "test" | "live";

export type CryptoConfig = {
  token: string;
  mode: CryptoMode;
  apiBase: string;
};

/** Invoice fields the site actually checks. Extra provider fields are ignored. */
export type CryptoInvoice = {
  invoice_id: number;
  status: string;
  amount: string;
  pay_url?: string;
  bot_invoice_url?: string;
  payload?: string;
  currency_type?: string;
  fiat?: string;
  accepted_assets?: string[] | string;
  paid_asset?: string | null;
  paid_amount?: string | null;
};

export class CryptoTimeoutError extends Error {
  constructor() {
    super("cryptopay timeout");
    this.name = "CryptoTimeoutError";
  }
}

const OFFICIAL: Record<CryptoMode, string> = {
  test: "https://testnet-pay.crypt.bot/api",
  live: "https://pay.crypt.bot/api",
};

function loopbackHttp(base: string): boolean {
  try {
    const url = new URL(base);
    const loop = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    return url.protocol === "http:" && loop;
  } catch {
    return false;
  }
}

/** Official hosts only. A local HTTP stand needs an explicit flag and the isolated profile. */
function allowedBase(mode: CryptoMode, base: string): boolean {
  if (base === OFFICIAL[mode]) return true;
  return envGet("CRYPTOPAY_LOCAL_STAND") === "1" && siteProfile() === "isolated" && loopbackHttp(base);
}

/** Token stays on the server. Empty values leave the provider off. */
export function readCryptoConfig(): CryptoConfig | null {
  if (envGet("CRYPTOPAY_ENABLED") !== "1") return null;
  const token = envGet("CRYPTOPAY_API_TOKEN");
  const mode = envGet("CRYPTOPAY_MODE");
  if (!token || (mode !== "test" && mode !== "live")) return null;
  const apiBase = (envGet("CRYPTOPAY_API_BASE") ?? OFFICIAL[mode]).replace(/\/$/, "");
  if (!allowedBase(mode, apiBase)) return null;
  return { token, mode, apiBase };
}

export function cryptoSignature(token: string, rawBody: string): string {
  const secret = createHash("sha256").update(token).digest();
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function cryptoSignatureValid(token: string, rawBody: string, header: string | null): boolean {
  if (!header || !/^[0-9a-f]{64}$/i.test(header)) return false;
  const expected = Buffer.from(cryptoSignature(token, rawBody), "hex");
  const got = Buffer.from(header, "hex");
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/** Whole rubles and kopecks, no binary float. */
export function decimalToMinor(value: string): number | null {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, frac = ""] = value.split(".");
  const minor = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Official invoices are https. A local stand may use http only on loopback. */
export function payUrlOf(invoice: CryptoInvoice): string | null {
  const url = invoice.bot_invoice_url || invoice.pay_url;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return url;
    const loop = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    if (parsed.protocol === "http:" && loop) return url;
  } catch {
    return null;
  }
  return null;
}

type CallOpts = { fetchImpl?: typeof fetch; timeoutMs?: number };

async function call<T>(cfg: CryptoConfig, method: string, body: unknown, opts?: CallOpts): Promise<T> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${cfg.apiBase}/${method}`, {
      method: "POST",
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 15_000),
      headers: { "Crypto-Pay-API-Token": cfg.token, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`cryptopay ${response.status}`);
    const json = (await response.json()) as { ok?: boolean; result?: T };
    if (!json.ok || json.result === undefined) throw new Error("cryptopay not ok");
    return json.result;
  } catch (error) {
    if (error instanceof CryptoTimeoutError) throw error;
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new CryptoTimeoutError();
    throw error;
  }
}

export function cryptoCreateInvoice(
  cfg: CryptoConfig,
  body: {
    amount: string;
    payload: string;
    description: string;
    paid_btn_url: string;
  },
  opts?: CallOpts,
): Promise<CryptoInvoice> {
  return call<CryptoInvoice>(
    cfg,
    "createInvoice",
    {
      currency_type: "fiat",
      fiat: "RUB",
      accepted_assets: "USDT",
      amount: body.amount,
      description: body.description,
      payload: body.payload,
      expires_in: 3600,
      paid_btn_name: "callback",
      paid_btn_url: body.paid_btn_url,
    },
    opts,
  );
}

export async function cryptoGetInvoice(cfg: CryptoConfig, invoiceId: string, opts?: CallOpts): Promise<CryptoInvoice | null> {
  if (!/^\d{1,20}$/.test(invoiceId)) return null;
  const result = await call<{ items?: CryptoInvoice[] }>(cfg, "getInvoices", { invoice_ids: invoiceId }, opts);
  const item = result.items?.find((row) => String(row.invoice_id) === invoiceId) ?? null;
  return item;
}

const INVOICE_PAGE = 100;
const INVOICE_PAGE_CAP = 20;

/**
 * Pages through active, then paid. `null` means a short page proved the payload is absent.
 * `"unknown"` means the search stopped before the end, so the caller must not create another invoice.
 */
export async function cryptoFindByPayload(cfg: CryptoConfig, payload: string, opts?: CallOpts): Promise<CryptoInvoice | null | "unknown"> {
  for (const status of ["active", "paid"]) {
    for (let page = 0; page < INVOICE_PAGE_CAP; page += 1) {
      const result = await call<{ items?: CryptoInvoice[] }>(cfg, "getInvoices", { status, count: INVOICE_PAGE, offset: page * INVOICE_PAGE }, opts);
      const items = result.items ?? [];
      const hit = items.find((row) => row.payload === payload);
      if (hit) return hit;
      if (items.length < INVOICE_PAGE) break;
      if (page === INVOICE_PAGE_CAP - 1) return "unknown";
    }
  }
  return null;
}
