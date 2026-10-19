export type Currency = "RUB" | "XTR";

/** Amounts are integer minor units: kopecks for RUB, whole Stars for XTR. */
export type Money = {
  amountMinor: number;
  currency: Currency;
};

const MINOR_DIGITS: Record<Currency, number> = { RUB: 2, XTR: 0 };

export function isValidMoney(value: Money): boolean {
  return (
    Number.isSafeInteger(value.amountMinor) &&
    value.amountMinor >= 0 &&
    value.currency in MINOR_DIGITS
  );
}

export function formatMoney(value: Money, locale = "ru-RU"): string {
  if (!isValidMoney(value)) throw new RangeError("Invalid money value");
  const digits = MINOR_DIGITS[value.currency];

  if (value.currency === "XTR") {
    const stars = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value.amountMinor);
    return `${stars} Stars`;
  }

  const hasFraction = value.amountMinor % 10 ** digits !== 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: value.currency,
    minimumFractionDigits: hasFraction ? digits : 0,
    maximumFractionDigits: digits,
  }).format(value.amountMinor / 10 ** digits);
}
