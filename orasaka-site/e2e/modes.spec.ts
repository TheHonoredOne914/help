import { request as pwRequest } from "@playwright/test";
import { expect, test } from "./support";

/*
 * Payments-disabled and live modes are separate production builds (layout text is rendered at
 * build time), started by scripts/e2e-prod.mjs. Without those URLs these tests are skipped
 * with an explicit reason instead of passing silently.
 */
const DISABLED = process.env.E2E_DISABLED_URL;
const LIVE = process.env.E2E_LIVE_URL;
const LIVE_STUB = process.env.E2E_LIVE_STUB_URL;
const STUB_HITS = process.env.E2E_STUB_HITS_URL;

test.describe("PAYMENTS_MODE=disabled (demo)", () => {
  test.skip(!DISABLED, "E2E_DISABLED_URL not set — run `npm run test:e2e:prod`");

  test("checkout offers no mock payment and the API refuses it", async ({ page }) => {
    await page.goto(`${DISABLED}/checkout?plan=test-1m`);
    await expect(page.getByRole("heading", { name: "Оплата на сайте отключена" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Перейти к оплате" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Оформить в боте/ })).toHaveAttribute("href", "https://t.me/orasakavpn_bot");
    await expect(page.getByRole("note")).toContainText("оплата на сайте отключена");

    const api = await pwRequest.newContext({ baseURL: DISABLED, extraHTTPHeaders: { origin: new URL(DISABLED!).origin } });
    expect((await api.post("/api/auth/demo-login")).status()).toBe(200);
    const methods = await (await api.get("/api/payments/methods")).json();
    expect(methods.mode).toBe("disabled");
    expect(methods.methods.filter((m: { status: string }) => m.status === "enabled")).toEqual([]);
    const order = await api.post("/api/orders", {
      headers: { "idempotency-key": `e2e-${crypto.randomUUID()}` },
      data: { planId: "test-1m", paymentMethod: "mock" },
    });
    expect(order.status()).toBe(403);
    expect((await order.json()).error).toBe("payments_disabled");
    expect((await api.post("/api/pay/mock/mockpay_x1", { data: { outcome: "succeeded" } })).status()).toBe(404);
    await api.dispose();
  });
});

test.describe("SITE_MODE=live without backend", () => {
  test.skip(!LIVE, "E2E_LIVE_URL not set — run `npm run test:e2e:prod`");

  test("no demo data, no mock payment, honest 'not configured' states", async ({ page, allowConsole }) => {
    // The BFF answers 503 backend_not_configured; the pages show that state instead of data.
    allowConsole(/status of 503 \(Service Unavailable\) \(http:\/\/[^)]+\/api\//);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${LIVE}/`);
    await expect(page.getByRole("note")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^подключиться/i }).first()).toHaveAttribute("href", "https://t.me/orasakavpn_bot");

    await page.goto(`${LIVE}/checkout`);
    await expect(page.getByText(/Оплата на сайте отключена|пока не работает на сайте/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Перейти к оплате" })).toHaveCount(0);
    await expect(page.getByText(/TEST · /)).toHaveCount(0);

    await page.goto(`${LIVE}/account`);
    await expect(page.getByRole("button", { name: "Войти в демо-кабинет" })).toHaveCount(0);
    expect(errors).toEqual([]);

    const api = await pwRequest.newContext({ baseURL: LIVE, extraHTTPHeaders: { origin: new URL(LIVE!).origin } });
    expect((await api.post("/api/auth/demo-login")).status()).toBe(404);
    expect((await api.get("/api/plans")).status()).toBe(503);
    expect((await (await api.get("/api/plans")).json()).error).toBe("backend_not_configured");
    const methods = await (await api.get("/api/payments/methods")).json();
    expect(methods.methods.map((m: { id: string }) => m.id)).not.toContain("mock");
    expect((await api.post("/api/pay/mock/mockpay_x1", { data: { outcome: "succeeded" } })).status()).toBe(404);
    await api.dispose();
  });
});

test.describe("SITE_MODE=live with ORASAKA_API_URL set (integration not enabled)", () => {
  test.skip(!LIVE_STUB || !STUB_HITS, "E2E_LIVE_STUB_URL not set — run `npm run test:e2e:prod`");

  test("the site sends no request to the backend and says the section does not work yet", async ({ page, allowConsole }) => {
    allowConsole(/status of 501 \(Not Implemented\) \(http:\/\/[^)]+\/api\//);
    const hits = async () => (await (await fetch(STUB_HITS!)).json()).count as number;
    const before = await hits();
    for (const path of ["/", "/pricing", "/checkout?plan=x", "/account", "/payment/return?orderId=x"]) {
      await page.goto(`${LIVE_STUB}${path}`);
      await page.waitForLoadState("networkidle");
    }
    await expect(page.getByText(/пока не работает на сайте/).first()).toBeVisible();

    const api = await pwRequest.newContext({ baseURL: LIVE_STUB, extraHTTPHeaders: { origin: new URL(LIVE_STUB!).origin } });
    const plans = await api.get("/api/plans");
    expect(plans.status()).toBe(501);
    expect((await plans.json()).error).toBe("contract_unverified");
    expect((await api.get("/api/auth/session")).status()).toBeLessThan(500);
    const order = await api.post("/api/orders", {
      headers: { "idempotency-key": `e2e-${crypto.randomUUID()}` },
      data: { planId: "x", paymentMethod: "yookassa" },
    });
    expect(order.status()).toBeGreaterThanOrEqual(400);
    await api.dispose();

    expect(await hits(), "requests that reached the stub backend").toBe(before);
  });
});
