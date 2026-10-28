import { readCryptoConfig } from "./cryptopay-api";
import { readYooConfig } from "./yookassa-api";
import { envGet } from "../server/env-get";
import { durationTermsReady } from "../vpn/duration-rule";

/**
 * Unlock when VPN_DURATION_RULE is a real rule for this profile:
 * calendar-months / fixed-day-blocks on any profile, or test-30-day-blocks on isolated only.
 * Public does not unlock by switching to isolated.
 */
export function termsReady(): boolean {
  return durationTermsReady();
}

/** Shop keys and PAYMENTS_READY are not enough. Fulfillment terms must be ready too. */
export function paymentsReady(): boolean {
  return envGet("PAYMENTS_READY") === "1" && readYooConfig() !== null && termsReady();
}

/** Crypto Pay is independent of YooKassa. The same term gate still blocks charges without a rule. */
export function cryptoChargeReady(): boolean {
  return readCryptoConfig() !== null && termsReady();
}

export function anyChargeReady(): boolean {
  return paymentsReady() || cryptoChargeReady();
}

export function paymentReadiness(): {
  yookassa: boolean;
  cryptopay: boolean;
  fulfillment: boolean;
} {
  return { yookassa: paymentsReady(), cryptopay: cryptoChargeReady(), fulfillment: termsReady() };
}

/** A non-YooKassa API base is the local HTTP stand, not a shop. */
export function paymentsStandNote(): string | null {
  if (!paymentsReady()) return null;
  const cfg = readYooConfig();
  if (!cfg) return null;
  if (cfg.apiBase === "https://api.yookassa.ru/v3") return null;
  return "Оплата на этом запуске идёт в локальный HTTP-стенд, не в магазин ЮKassa.";
}

/** Testnet, a local stand, or test mode is not a live USDT charge. */
export function cryptoStandNote(): string | null {
  const cfg = readCryptoConfig();
  if (!cfg || !cryptoChargeReady()) return null;
  if (cfg.mode === "live" && cfg.apiBase === "https://pay.crypt.bot/api") return null;
  return "Это тестовый стенд Crypto Pay, не боевое списание USDT.";
}
