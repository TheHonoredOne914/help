import { type Page } from "@playwright/test";
import { expect, test } from "./support";

/*
 * The hero (H1, description, "Выбрать тариф") must be readable before and without
 * JavaScript, with slow JavaScript, and with reduced motion. Secondary blocks must never stay
 * hidden when the reveal script does not run.
 */
async function expectHeroVisible(page: Page) {
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toBeVisible();
  await expect(h1).toContainText("контроль над интернетом");
  await expect(page.getByTestId("hero-lead")).toBeVisible();
  const cta = page.getByRole("link", { name: "Выбрать тариф" }).first();
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute("href", "/pricing");
  for (const el of [h1, page.getByTestId("hero-lead"), cta]) {
    const style = await el.evaluate((n) => {
      const s = getComputedStyle(n);
      return { opacity: Number(s.opacity), visibility: s.visibility };
    });
    expect(style.opacity).toBe(1);
    expect(style.visibility).toBe("visible");
  }
}

/** All content blocks below the fold, as rendered, without scrolling. */
const hiddenBlocks = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main section, main h2, main li")]
      .filter((el) => !el.closest("[aria-hidden='true']") && Number(getComputedStyle(el).opacity) < 1)
      .map((el) => el.tagName + ":" + (el.textContent ?? "").trim().slice(0, 30)),
  );

test("without JavaScript: hero is complete and nothing is left hidden", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto("/");
  await expectHeroVisible(page);
  const box = await page.getByRole("link", { name: "Выбрать тариф" }).first().boundingBox();
  expect(box!.y + box!.height, "CTA within the first screen at 390×844").toBeLessThanOrEqual(844);
  expect(await page.locator("[data-reveal]").count()).toBe(0);
  expect(await hiddenBlocks(page)).toEqual([]);
  await ctx.close();
});

test("with slow JavaScript: hero is complete before scripts arrive", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(/\/_next\/static\/.*\.js(\?|$)/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expectHeroVisible(page);
  expect(await page.evaluate(() => document.querySelectorAll("[data-reveal]").length)).toBe(0);
  release();
  await expectHeroVisible(page);
});

test("with reduced motion: hero and blocks are shown at once, no pending reveals", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("/");
  await expectHeroVisible(page);
  await page.waitForLoadState("networkidle");
  expect(await page.locator('[data-reveal="pending"]').count()).toBe(0);
  expect(await hiddenBlocks(page)).toEqual([]);
  const running = await page.evaluate(
    () => document.getAnimations().filter((a) => a instanceof CSSAnimation && a.playState === "running").length,
  );
  expect(running, "no CSS loops under reduced motion").toBe(0);
  await ctx.close();
});

test("with JavaScript: below-fold blocks reveal on scroll, the hero never hides", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expectHeroVisible(page);
  expect(await page.locator('[data-reveal="pending"]').count()).toBeGreaterThan(0);
  for (let y = 0; y < 12; y++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(120);
  }
  await expect.poll(() => page.locator('[data-reveal="pending"]').count()).toBe(0);
});

const onScreenPending = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-reveal='pending']")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight;
    }).length,
  );

test("back navigation and a taller viewport do not leave on-screen content pending", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto("/");
  await expect.poll(() => page.locator('[data-reveal="pending"]').count()).toBeGreaterThan(0);
  await page.getByRole("link", { name: /выбрать тариф/i }).first().click();
  await expect(page).toHaveURL(/\/pricing$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  expect(await onScreenPending(page)).toBe(0);
  await page.setViewportSize({ width: 1440, height: 2400 });
  await expect.poll(() => onScreenPending(page)).toBe(0);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.locator('[data-reveal="pending"]').count()).toBe(0);
});
