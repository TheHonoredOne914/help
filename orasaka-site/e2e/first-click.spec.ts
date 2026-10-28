import { expect, test } from "./support";

/**
 * Cold load. Scripts are held, then released. Each action is one click after the control
 * is honestly enabled — no retry loop and no programmatic handler call.
 * A browser with JavaScript disabled still follows real links.
 */

test("without JavaScript a visible link still opens the next page", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("link", { name: "Выбрать тариф" }).first().click();
  await expect(page).toHaveURL(/\/pricing/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await ctx.close();
});

test("slow JavaScript: menu and demo login are inert, then one click each works", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __clicks: number; __sawDisabledLogin: boolean };
    w.__clicks = 0;
    w.__sawDisabledLogin = false;
    document.addEventListener("click", () => {
      w.__clicks += 1;
    }, true);
    const watch = () => {
      for (const button of document.querySelectorAll("button")) {
        if (button.textContent?.includes("Войти в демо-кабинет") && button.disabled) w.__sawDisabledLogin = true;
      }
    };
    new MutationObserver(watch).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["disabled"],
    });
  });
  await page.route(/\/_next\/static\/.*\.js(\?|$)/, async (route) => {
    await gate;
    await route.continue();
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("script[src*='/_next/static']").first()).toBeAttached();
  expect(await page.content()).not.toContain("data-boot");
  const menu = page.getByRole("button", { name: "Открыть меню" });
  await expect(menu).toBeVisible();
  await expect(menu).toBeDisabled();

  release();
  await expect(menu).toBeEnabled();
  await menu.click();
  await expect(page.getByRole("navigation", { name: "Мобильная навигация" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __clicks: number }).__clicks)).toBe(1);

  let releaseAccount!: () => void;
  const accountGate = new Promise<void>((resolve) => {
    releaseAccount = resolve;
  });
  await page.unroute(/\/_next\/static\/.*\.js(\?|$)/);
  await page.route(/\/_next\/static\/.*\.js(\?|$)/, async (route) => {
    await accountGate;
    await route.continue();
  });
  await page.goto("/account", { waitUntil: "domcontentloaded" });
  const login = page.getByRole("button", { name: "Войти в демо-кабинет" });
  // The cabinet can stream in without the framework. If the button is already painted, it must
  // be disabled. Do not wait on the held scripts or this step deadlocks.
  await page.waitForTimeout(400);
  const loginPaintedEarly = await login.isVisible();
  if (loginPaintedEarly) await expect(login).toBeDisabled();

  releaseAccount();
  await expect(login).toBeEnabled();
  if (loginPaintedEarly) {
    expect(await page.evaluate(() => (window as unknown as { __sawDisabledLogin: boolean }).__sawDisabledLogin)).toBe(true);
  }
  const clicksBefore = await page.evaluate(() => (window as unknown as { __clicks: number }).__clicks);
  await login.click();
  await expect(page.getByText("Демо-пользователь")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __clicks: number }).__clicks)).toBe(clicksBefore + 1);
});
