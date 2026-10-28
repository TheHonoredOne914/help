import { envGet } from "../server/env-get";
import { siteProfile } from "../server/profile";

export type YooMode = "test" | "live";

export type YooConfig = {
  shopId: string;
  secretKey: string;
  mode: YooMode;
  apiBase: string;
};

export type YooPayment = {
  id: string;
  status: string;
  test?: boolean;
  amount: { value: string; currency: string };
  metadata?: { orderId?: string };
  recipient?: { account_id?: string };
  confirmation?: { confirmation_url?: string };
};

export class YooTimeoutError extends Error {
  constructor() {
    super("yookassa timeout");
    this.name = "YooTimeoutError";
  }
}

const OFFICIAL = "https://api.yookassa.ru/v3";

function loopbackHttp(base: string): boolean {
  try {
    const url = new URL(base);
    const loop = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    return url.protocol === "http:" && loop;
  } catch {
    return false;
  }
}

/** Official API only. A local HTTP stand needs YOOKASSA_LOCAL_STAND=1 and the isolated profile. */
function allowedBase(base: string): boolean {
  if (base === OFFICIAL) return true;
  return envGet("YOOKASSA_LOCAL_STAND") === "1" && siteProfile() === "isolated" && loopbackHttp(base);
}

/**
 * Shop id, secret, and YOOKASSA_MODE come from server env only.
 * Empty values leave charging off. No invented credentials.
 */
export function readYooConfig(): YooConfig | null {
  const shopId = envGet("YOOKASSA_SHOP_ID");
  const secretKey = envGet("YOOKASSA_SECRET_KEY");
  const mode = envGet("YOOKASSA_MODE");
  if (!shopId || !secretKey || (mode !== "test" && mode !== "live")) return null;
  const apiBase = (envGet("YOOKASSA_API_BASE") ?? OFFICIAL).replace(/\/$/, "");
  if (!allowedBase(apiBase)) return null;
  return { shopId, secretKey, mode, apiBase };
}

async function yooFetch(
  cfg: YooConfig,
  path: string,
  init: RequestInit & { headers: Record<string, string> },
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<YooPayment> {
  const auth = Buffer.from(`${cfg.shopId}:${cfg.secretKey}`).toString("base64");
  try {
    const response = await fetchImpl(`${cfg.apiBase}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      headers: { authorization: `Basic ${auth}`, "content-type": "application/json", ...init.headers },
    });
    if (!response.ok) throw new Error(`yookassa ${response.status}`);
    return (await response.json()) as YooPayment;
  } catch (error) {
    if (error instanceof YooTimeoutError) throw error;
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new YooTimeoutError();
    throw error;
  }
}

export function yooCreatePayment(
  cfg: YooConfig,
  idempotenceKey: string,
  body: unknown,
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<YooPayment> {
  return yooFetch(
    cfg,
    "/payments",
    { method: "POST", headers: { "Idempotence-Key": idempotenceKey }, body: JSON.stringify(body) },
    opts?.timeoutMs ?? 15_000,
    opts?.fetchImpl ?? fetch,
  );
}

export function yooGetPayment(cfg: YooConfig, id: string, opts?: { fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<YooPayment> {
  if (!/^[\w-]{1,80}$/.test(id)) throw new Error("bad payment id");
  return yooFetch(cfg, `/payments/${encodeURIComponent(id)}`, { method: "GET", headers: {} }, opts?.timeoutMs ?? 15_000, opts?.fetchImpl ?? fetch);
}
