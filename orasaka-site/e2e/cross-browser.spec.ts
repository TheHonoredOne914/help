import { type Page } from "@playwright/test";
import { demoLogin, expect, test } from "./support";

/*
 * Main scenarios outside Chromium. Desktop Firefox and desktop WebKit — not a phone,
 * and not iOS Safari or Android Chrome.
 */
const BOT = "https://t.me/orasakavpn_bot";

async function hero(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/ORASAKA\s*VPN/);
  await expect(page.getByTestId("hero-lead")).toBeVisible();
  await expect(page.getByRole("link", { name: /^подключиться/i }).first()).toHaveAttribute("href", BOT);
}

test("hero, scroll, tariff and back", async ({ page }) => {
  await page.goto("/");
  await hero(page);
  await page.mouse.wheel(0, 900);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(200);
  await page.goto("/pricing");
  await page.getByRole("link", { name: "Оформить (демо)" }).first().click();
  await expect(page).toHaveURL(/\/checkout\?plan=/);
  await page.goBack();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("mobile menu opens and Escape closes it", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto("/");
  await hero(page);
  const toggle = page.getByRole("button", { name: "Открыть меню" });
  await expect(toggle).toHaveAttribute("data-hydrated", "true");
  await toggle.click();
  const nav = page.getByRole("navigation", { name: "Мобильная навигация" });
  await expect(nav).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(nav).toBeHidden();
  await ctx.close();
});

test("pause stops decorative motion; reduced motion can be switched on after load", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".fx-canvas")).toHaveAttribute("data-ready", "true");
  await page.getByTestId("ambient-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-ambient", "paused");
  await expect(page.locator(".fx-canvas")).toHaveAttribute("data-running", "false");
  const running = await page.evaluate(
    () => document.getAnimations().filter((a) => a instanceof CSSAnimation && a.playState === "running" && a.effect?.getTiming().iterations === Infinity).length,
  );
  expect(running).toBe(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-fx", "static");
  await expect(page.locator('[data-reveal="pending"]')).toHaveCount(0);
  await hero(page);
});

test("dialog: keyboard Escape closes it and focus returns", async ({ page }) => {
  await demoLogin(page);
  // The default fixture has no devices. "active" is the preset that renders «Отключить».
  await page.locator("select").selectOption("active");
  const remove = page.getByRole("button", { name: "Отключить" }).first();
  await remove.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(remove).toBeFocused();
});

test("without JavaScript the hero and the bot link are visible", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto("/");
  await hero(page);
  expect(await page.locator("[data-reveal]").count()).toBe(0);
  await ctx.close();
});

test("a link stays clickable when the custom cursor cannot start", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(500);
  const link = page.getByRole("link", { name: /выбрать тариф/i }).first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/pricing$/);
});
