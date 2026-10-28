import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Isolated test double. Not a Telegram Login Widget hash and not the bot token. */
export const DOUBLE_AUD = "orasaka-test-double";

export function dataCheckString(fields: Record<string, string>): string {
  return Object.keys(fields)
    .filter((key) => key !== "hash")
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
}

export function signTelegram(fields: Record<string, string>, secret: string | Buffer): string {
  return createHmac("sha256", secret).update(dataCheckString(fields)).digest("hex");
}

function hmacEqual(expectedHex: string, actualHex: string): boolean {
  const left = Buffer.from(expectedHex, "hex");
  const right = Buffer.from(actualHex, "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

export function stringFields(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string" || item.length > 512 || key.length > 40) return null;
    out[key] = item;
  }
  if (!out.hash || !out.id || !out.auth_date) return null;
  return out;
}

export function mintDoubleProof(
  secret: string,
  telegramId: string,
  username: string,
  now: number,
  nonce = randomBytes(16).toString("hex"),
): Record<string, string> {
  const fields: Record<string, string> = {
    aud: DOUBLE_AUD,
    auth_date: String(Math.floor(now / 1000)),
    id: telegramId,
    nonce,
    username,
  };
  fields.hash = signTelegram(fields, secret);
  return fields;
}

export function checkProof(
  fields: Record<string, string>,
  opts: { now: number; doubleSecret: string | null; botToken: string | null; allowDouble: boolean },
): { ok: true; id: string; aud: "double" | "telegram" } | { ok: false; error: "bad_proof" | "expired" } {
  if (!/^\d{1,20}$/.test(fields.id ?? "")) return { ok: false, error: "bad_proof" };
  const auth = Number(fields.auth_date);
  if (!Number.isSafeInteger(auth)) return { ok: false, error: "bad_proof" };
  if (!/^[0-9a-f]{64}$/.test(fields.hash ?? "")) return { ok: false, error: "bad_proof" };
  const skew = Math.floor(opts.now / 1000) - auth;
  if (fields.aud === DOUBLE_AUD) {
    if (!opts.allowDouble || !opts.doubleSecret || (fields.nonce ?? "").length < 16) return { ok: false, error: "bad_proof" };
    if (skew > 900 || skew < -60) return { ok: false, error: "expired" };
    if (!hmacEqual(signTelegram(fields, opts.doubleSecret), fields.hash)) return { ok: false, error: "bad_proof" };
    return { ok: true, id: fields.id, aud: "double" };
  }
  if (fields.aud || !opts.botToken) return { ok: false, error: "bad_proof" };
  if (skew > 86_400 || skew < -60) return { ok: false, error: "expired" };
  const secret = createHash("sha256").update(opts.botToken).digest();
  if (!hmacEqual(signTelegram(fields, secret), fields.hash)) return { ok: false, error: "bad_proof" };
  return { ok: true, id: fields.id, aud: "telegram" };
}
