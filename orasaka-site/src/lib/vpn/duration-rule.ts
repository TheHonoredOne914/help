import { envGet } from "../server/env-get";
import { siteProfile } from "../server/profile";

/**
 * Agreed duration rules for grant/renewal.
 * Renewal base is always max(current end, grant time).
 * test-30-day-blocks is isolated-only. Production unlocks need calendar-months or fixed-day-blocks.
 */
export type DurationRule = "test-30-day-blocks" | "calendar-months" | "fixed-day-blocks";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Fixed-day production block and the isolated test rule both use 30-day units. */
const FIXED_BLOCK_DAYS = 30;

export function parseDurationRule(raw: string | undefined): DurationRule | null {
  if (raw === "test-30-day-blocks" || raw === "calendar-months" || raw === "fixed-day-blocks") return raw;
  return null;
}

/**
 * Rule the site may send on /v1/grants for the current profile.
 * Public never returns the isolated test rule. Unknown or empty → null.
 */
export function configuredDurationRule(): DurationRule | null {
  const rule = parseDurationRule(envGet("VPN_DURATION_RULE"));
  if (!rule) return null;
  if (rule === "test-30-day-blocks" && siteProfile() !== "isolated") return null;
  return rule;
}

/** Charging unlocks only when a real rule is configured for this profile. */
export function durationTermsReady(): boolean {
  return configuredDurationRule() !== null;
}

/** Extend from max(current end, now). Calendar months keep the day-of-month when possible. */
export function extendExpiresAt(
  currentExpiresAt: string | null | undefined,
  termMonths: number,
  rule: DurationRule,
  nowMs: number,
): string {
  const baseMs = Math.max(currentExpiresAt ? Date.parse(currentExpiresAt) : 0, nowMs);
  if (rule === "calendar-months") return addCalendarMonthsUtc(baseMs, termMonths);
  return new Date(baseMs + termMonths * FIXED_BLOCK_DAYS * DAY_MS).toISOString();
}

function addCalendarMonthsUtc(baseMs: number, months: number): string {
  const base = new Date(baseMs);
  const day = base.getUTCDate();
  const hours = base.getUTCHours();
  const minutes = base.getUTCMinutes();
  const seconds = base.getUTCSeconds();
  const ms = base.getUTCMilliseconds();
  const first = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, 1, hours, minutes, seconds, ms));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, lastDay), hours, minutes, seconds, ms)).toISOString();
}
