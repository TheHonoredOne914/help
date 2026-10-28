import { monthsLabel } from "./months";
import { formatMoney, type Money } from "./money";

/**
 * Owner-confirmed ORASAKA VPN prices, 2026-10-21.
 * Full price for the whole term. Savings are exact rubles versus 200 ₽ per month.
 * Device counts, traffic, countries and a trial are not in this list.
 */
export const CATALOG_VERSION = "2026-10-21";
const MONTH_MINOR = 20_000;

export type CatalogPlan = {
  id: string;
  months: number;
  amountMinor: number;
  currency: "RUB";
  /** 0 when the term is one month at the reference price. */
  saveMinor: number;
};

function plan(months: number, amountMinor: number): CatalogPlan {
  const saveMinor = months * MONTH_MINOR - amountMinor;
  if (!Number.isSafeInteger(saveMinor) || saveMinor < 0) throw new Error("catalog price");
  return { id: `${months}m`, months, amountMinor, currency: "RUB", saveMinor };
}

export const CATALOG: readonly CatalogPlan[] = [
  plan(1, 20_000),
  plan(3, 50_000),
  plan(6, 90_000),
  plan(12, 160_000),
];

export function quotePlan(planId: string): CatalogPlan | null {
  return CATALOG.find((plan) => plan.id === planId) ?? null;
}

export function catalogMoney(plan: CatalogPlan): Money {
  return { amountMinor: plan.amountMinor, currency: plan.currency };
}

/** Same string the FAQ and the cards use. */
export function catalogPriceLine(): string {
  return CATALOG.map((plan) => `${monthsLabel(plan.months)} — ${formatMoney(catalogMoney(plan))}`).join(", ");
}
