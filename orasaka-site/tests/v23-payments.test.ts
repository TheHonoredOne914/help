import { describe, expect, it, afterEach } from "vitest";
import { paymentsReady, termsReady, cryptoChargeReady } from "../src/lib/payments/ready";
import { readYooConfig } from "../src/lib/payments/yookassa-api";
import { readCryptoConfig } from "../src/lib/payments/cryptopay-api";
import { assertBootConfig } from "../src/lib/server/profile";
import { configuredDurationRule, extendExpiresAt } from "../src/lib/vpn/duration-rule";
import { readHttpVpnConfig } from "../src/lib/vpn/http-adapter";

const saved = new Map<string, string | undefined>();

function useEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
});

describe("v23 duration rules and payment gates", () => {
  it("computes calendar months and fixed-day blocks from max(current end, now)", () => {
    const now = Date.parse("2026-01-31T12:00:00.000Z");
    const cal = extendExpiresAt(null, 1, "calendar-months", now);
    expect(cal).toBe("2026-02-28T12:00:00.000Z");
    const fixed = extendExpiresAt(null, 1, "fixed-day-blocks", now);
    expect(fixed).toBe("2026-03-02T12:00:00.000Z");
    const later = "2026-06-15T08:00:00.000Z";
    expect(extendExpiresAt(later, 3, "calendar-months", now)).toBe("2026-09-15T08:00:00.000Z");
    expect(extendExpiresAt(later, 1, "fixed-day-blocks", now)).toBe("2026-07-15T08:00:00.000Z");
  });

  it("unlocks public terms only with a production rule, never by flipping to isolated alone", () => {
    useEnv({
      ORASAKA_PROFILE: "public",
      ORASAKA_DB_PATH: "/tmp/orasaka-v23-guard.sqlite",
      PAYMENTS_READY: "1",
      YOOKASSA_SHOP_ID: "shop",
      YOOKASSA_SECRET_KEY: "secret",
      YOOKASSA_MODE: "test",
      YOOKASSA_API_BASE: undefined,
      VPN_DURATION_RULE: undefined,
    });
    expect(termsReady()).toBe(false);
    expect(paymentsReady()).toBe(false);
    expect(() => assertBootConfig()).not.toThrow();

    useEnv({ VPN_DURATION_RULE: "calendar-months" });
    expect(termsReady()).toBe(true);
    expect(paymentsReady()).toBe(true);
    expect(configuredDurationRule()).toBe("calendar-months");

    useEnv({ VPN_DURATION_RULE: "fixed-day-blocks" });
    expect(termsReady()).toBe(true);
    expect(paymentsReady()).toBe(true);

    useEnv({ VPN_DURATION_RULE: "test-30-day-blocks" });
    expect(() => assertBootConfig()).toThrow(/duration/);
    expect(termsReady()).toBe(false);
    expect(paymentsReady()).toBe(false);

    useEnv({ ORASAKA_PROFILE: "isolated", VPN_DURATION_RULE: undefined });
    expect(termsReady()).toBe(false);
    expect(paymentsReady()).toBe(false);

    useEnv({ VPN_DURATION_RULE: "test-30-day-blocks" });
    expect(termsReady()).toBe(true);
    expect(paymentsReady()).toBe(true);
  });

  it("refuses a local YooKassa stand on public and without the isolated flag", () => {
    useEnv({
      ORASAKA_PROFILE: "public",
      ORASAKA_DB_PATH: "/tmp/orasaka-v23-yoo.sqlite",
      YOOKASSA_SHOP_ID: "shop",
      YOOKASSA_SECRET_KEY: "secret",
      YOOKASSA_MODE: "test",
      YOOKASSA_API_BASE: "http://127.0.0.1:9/v3",
      YOOKASSA_LOCAL_STAND: undefined,
      VPN_DURATION_RULE: "calendar-months",
      PAYMENTS_READY: "1",
    });
    expect(readYooConfig()).toBeNull();
    expect(paymentsReady()).toBe(false);

    useEnv({ YOOKASSA_LOCAL_STAND: "1" });
    expect(() => assertBootConfig()).toThrow(/YOOKASSA_LOCAL_STAND/);
    expect(readYooConfig()).toBeNull();

    useEnv({ ORASAKA_PROFILE: "isolated", YOOKASSA_LOCAL_STAND: "1" });
    expect(readYooConfig()?.apiBase).toBe("http://127.0.0.1:9/v3");
    expect(paymentsReady()).toBe(true);

    useEnv({ YOOKASSA_LOCAL_STAND: undefined, YOOKASSA_API_BASE: "https://api.yookassa.ru/v3" });
    expect(readYooConfig()?.mode).toBe("test");
  });

  it("keeps Crypto Pay off without a token and refuses local stand on public", () => {
    useEnv({
      ORASAKA_PROFILE: "public",
      ORASAKA_DB_PATH: "/tmp/orasaka-v23-crypto.sqlite",
      CRYPTOPAY_ENABLED: "1",
      CRYPTOPAY_API_TOKEN: undefined,
      CRYPTOPAY_MODE: "test",
      VPN_DURATION_RULE: "calendar-months",
    });
    expect(readCryptoConfig()).toBeNull();
    expect(cryptoChargeReady()).toBe(false);

    useEnv({
      CRYPTOPAY_API_TOKEN: "token",
      CRYPTOPAY_API_BASE: "http://127.0.0.1:9/api",
      CRYPTOPAY_LOCAL_STAND: "1",
    });
    expect(() => assertBootConfig()).toThrow(/CRYPTOPAY_LOCAL_STAND/);
    expect(readCryptoConfig()).toBeNull();

    useEnv({
      CRYPTOPAY_LOCAL_STAND: undefined,
      CRYPTOPAY_API_BASE: "https://testnet-pay.crypt.bot/api",
    });
    expect(readCryptoConfig()?.mode).toBe("test");
    expect(cryptoChargeReady()).toBe(true);
  });

  it("sends the configured production rule on the HTTP adapter when VPN keys exist", () => {
    useEnv({
      ORASAKA_PROFILE: "public",
      VPN_BASE_URL: "https://vpn.example/api",
      VPN_API_TOKEN: "vpn-token",
      VPN_DURATION_RULE: "fixed-day-blocks",
    });
    expect(readHttpVpnConfig()?.durationRule).toBe("fixed-day-blocks");
    useEnv({ VPN_API_TOKEN: undefined });
    expect(readHttpVpnConfig()).toBeNull();
  });
});
