import { describe, expect, it } from "vitest";
import { formatMoney, isValidMoney } from "../src/lib/money";

const nbsp = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

describe("money", () => {
  it("formats RUB from integer kopecks", () => {
    expect(nbsp(formatMoney({ amountMinor: 29900, currency: "RUB" }))).toBe("299 ₽");
    expect(nbsp(formatMoney({ amountMinor: 29950, currency: "RUB" }))).toBe("299,50 ₽");
    expect(nbsp(formatMoney({ amountMinor: 1_000_000, currency: "RUB" }))).toBe("10 000 ₽");
  });

  it("formats Stars separately without conversion", () => {
    expect(nbsp(formatMoney({ amountMinor: 150, currency: "XTR" }))).toBe("150 Stars");
  });

  it("rejects floats, negatives and unknown currencies", () => {
    expect(isValidMoney({ amountMinor: 1.5, currency: "RUB" })).toBe(false);
    expect(isValidMoney({ amountMinor: -1, currency: "RUB" })).toBe(false);
    expect(isValidMoney({ amountMinor: 1, currency: "USD" as "RUB" })).toBe(false);
    expect(() => formatMoney({ amountMinor: 0.1, currency: "RUB" })).toThrow(RangeError);
  });
});
