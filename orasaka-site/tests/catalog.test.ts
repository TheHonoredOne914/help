import { describe, expect, it } from "vitest";
import { CATALOG, catalogPriceLine, quotePlan } from "../src/lib/catalog";
import { formatMoney } from "../src/lib/money";
import { yookassaNotificationPaymentId, yookassaRedirectBody, yookassaValue } from "../src/lib/payments/yookassa-redirect";

const nbsp = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

describe("catalog", () => {
  it("lists the four confirmed full-term prices and exact savings", () => {
    expect(CATALOG.map((p) => [p.months, p.amountMinor, p.saveMinor])).toEqual([
      [1, 20_000, 0],
      [3, 50_000, 10_000],
      [6, 90_000, 30_000],
      [12, 160_000, 80_000],
    ]);
    expect(nbsp(catalogPriceLine())).toBe("1 месяц — 200 ₽, 3 месяца — 500 ₽, 6 месяцев — 900 ₽, 12 месяцев — 1 600 ₽");
    expect(CATALOG.some((p) => [29900, 69900, 310800, 610800].includes(p.amountMinor))).toBe(false);
  });

  it("quotes by id and ignores any other amount", () => {
    expect(quotePlan("3m")?.amountMinor).toBe(50_000);
    expect(quotePlan("3m")?.id).toBe("3m");
    expect(quotePlan("plus")).toBeNull();
  });
});

describe("yookassa redirect body", () => {
  it("fixes the amount from the catalog and does not treat the return url as payload proof", () => {
    const body = yookassaRedirectBody("12m", "ord_1", "https://shop.example/payment/return");
    expect(body?.amount).toEqual({ value: "1600.00", currency: "RUB" });
    expect(body?.confirmation).toEqual({ type: "redirect", return_url: "https://shop.example/payment/return" });
    expect(body?.metadata).toEqual({ orderId: "ord_1" });
    expect(JSON.stringify(body)).not.toContain("hmac");
    expect(yookassaRedirectBody("nope", "ord_1", "https://shop.example/r")).toBeNull();
    expect(yookassaValue(20_000)).toBe("200.00");
    expect(nbsp(formatMoney({ amountMinor: 160_000, currency: "RUB" }))).toBe("1 600 ₽");
  });

  it("reads only a payment id from a notification", () => {
    expect(yookassaNotificationPaymentId({ event: "payment.succeeded", object: { id: "pay_1", status: "succeeded" } })).toBe("pay_1");
    expect(yookassaNotificationPaymentId({ object: { status: "succeeded" } })).toBeNull();
    expect(yookassaNotificationPaymentId(null)).toBeNull();
  });
});
