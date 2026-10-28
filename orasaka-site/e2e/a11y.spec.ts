import AxeBuilder from "@axe-core/playwright";
import { demoLogin, expect, startPurchase, test } from "./support";

/*
 * Automated WCAG 2.1 A/AA scan (axe-core) of the main pages, desktop and mobile widths.
 * Automated rules catch roughly a third of issues; manual screen-reader testing is still needed.
 */
const PAGES = ["/", "/pricing", "/connect", "/devices", "/faq", "/support", "/account", "/checkout", "/legal/offer"];

async function scan(page: import("@playwright/test").Page, label: string) {
  // Let entrance animations finish so contrast is measured on final colours.
  await page.waitForTimeout(1200);
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude(".fx-canvas").analyze();
  const found = res.violations.map((v) => `${label}: ${v.id} (${v.impact}) ×${v.nodes.length} — ${v.nodes[0]?.target.join(" ")}`);
  if (found.length) console.log(found.join("\n"));
  return found;
}

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
] as const) {
  test(`axe: public pages have no WCAG A/AA violations (${name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const all: string[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      all.push(...(await scan(page, path)));
    }
    expect(all).toEqual([]);
  });
}

test("axe: logged-in account, order, gateway and result pages", async ({ page }) => {
  await demoLogin(page);
  const all: string[] = [...(await scan(page, "/account (logged in)"))];
  const orderId = await startPurchase(page);
  all.push(...(await scan(page, "/pay/mock")));
  await page.goto(`/checkout/${orderId}`);
  all.push(...(await scan(page, "/checkout/[id]")));
  await page.getByRole("button", { name: "Отменить заказ" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  all.push(...(await scan(page, "cancel dialog")));
  await page.keyboard.press("Escape");
  await page.goto(`/payment/error?orderId=${orderId}`);
  all.push(...(await scan(page, "/payment/error")));
  expect(all).toEqual([]);
});
