import { expect, test, type Page } from "@playwright/test";

const cursor = (page: Page) => page.getByTestId("cyber-cursor");

async function tipPosition(page: Page) {
  return page.evaluate(() => {
    const pos = document.querySelector<HTMLElement>("[data-testid='cyber-cursor'] [data-part='pos']")!;
    const m = new DOMMatrix(getComputedStyle(pos).transform);
    const r = pos.getBoundingClientRect();
    return { x: m.e, y: m.f, left: r.left, top: r.top };
  });
}

test.describe("ORASAKA cyber cursor (desktop)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-cursor", "cyber");
  });

  test("tip sits exactly at the real pointer position, with no lag", async ({ page }) => {
    for (const [x, y] of [
      [120, 140],
      [733, 418],
      [1301, 77],
      [64, 860],
    ]) {
      await page.mouse.move(x, y);
      const p = await tipPosition(page);
      expect(p.x).toBe(x);
      expect(p.y).toBe(y);
      expect(Math.abs(p.left - x)).toBeLessThan(0.5);
      expect(Math.abs(p.top - y)).toBeLessThan(0.5);
    }
  });

  test("system cursor is hidden but the custom one is visible", async ({ page }) => {
    await page.mouse.move(300, 300);
    await expect(cursor(page)).not.toHaveAttribute("data-hidden", "true");
    expect(await page.evaluate(() => getComputedStyle(document.body).cursor)).toBe("none");
  });

  test("buttons switch to the reticle, cards get a frame and tilt", async ({ page }) => {
    const cta = page.getByRole("link", { name: /выбрать тариф/i }).first();
    const box = (await cta.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    await expect(cursor(page)).toHaveAttribute("data-state", "button");
    await expect(page.locator(".cc-reticle")).toHaveCSS("opacity", "1");

    const card = page.locator("[data-cursor='card']").first();
    await card.scrollIntoViewIfNeeded();
    const cb = (await card.boundingBox())!;
    await page.mouse.move(cb.x + cb.width * 0.3, cb.y + cb.height * 0.3, { steps: 6 });
    await expect(cursor(page)).toHaveAttribute("data-state", "card");
    await expect(cursor(page)).toHaveAttribute("data-card", "true");
    await expect(card).toHaveAttribute("data-tilting", "true");
    await expect(page.locator(".cc-frame")).toHaveCSS("opacity", "1");
  });

  test("click shows a short pulse and does not block the click", async ({ page }) => {
    const cta = page.getByRole("link", { name: /выбрать тариф/i }).first();
    const box = (await cta.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.locator(".cc-pulse")).toHaveCount(1);
    await page.mouse.up();
    await expect(page).toHaveURL(/\/pricing$/);
  });

  test("text inputs keep the system I-beam", async ({ page }) => {
    await page.evaluate(() => {
      const input = document.createElement("input");
      input.id = "e2e-input";
      input.style.cssText = "position:fixed;top:200px;left:200px;width:300px;height:40px;z-index:10";
      document.body.append(input);
    });
    const input = page.locator("#e2e-input");
    await input.hover();
    await expect(input).toHaveCSS("cursor", "text");
    await expect(cursor(page)).toHaveAttribute("data-state", "text");
    await expect(page.locator(".cc-pos")).toHaveCSS("opacity", "0");
  });

  test("text selection still works", async ({ page }) => {
    const lead = page.locator("main p").filter({ hasText: /.{80,}/ }).first();
    await lead.scrollIntoViewIfNeeded();
    const b = (await lead.boundingBox())!;
    await page.mouse.move(b.x + 2, b.y + 10);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.6, b.y + 10, { steps: 5 });
    await page.mouse.up();
    expect((await page.evaluate(() => getSelection()?.toString() ?? "")).length).toBeGreaterThan(3);
  });
});

test.describe("cursor is not used where it should not be", () => {
  test("absent on touch devices", async ({ browser }) => {
    const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-fx", /live|static/);
    await expect(cursor(page)).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveAttribute("data-cursor", "cyber");
    await ctx.close();
  });

  test("reduced motion: static background, no trail, no pulse", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-fx", "static");
    await page.mouse.move(400, 400);
    await page.mouse.move(600, 500, { steps: 8 });
    const trailVisible = await page.$$eval("[data-part='trail']", (els) =>
      els.some((e) => getComputedStyle(e).display !== "none" && getComputedStyle(e).opacity !== "0"),
    );
    expect(trailVisible).toBe(false);
    await page.mouse.down();
    await expect(page.locator(".cc-pulse")).toHaveCount(0);
    await page.mouse.up();
    // The pointer itself still follows exactly.
    const p = await tipPosition(page);
    expect([p.x, p.y]).toEqual([600, 500]);
    await ctx.close();
  });

  test("falls back to the system cursor if the custom cursor cannot start", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => {
      HTMLElement.prototype.showPopover = () => {
        throw new Error("blocked");
      };
    });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.waitForTimeout(500);
    await expect(page.locator("html")).not.toHaveAttribute("data-cursor", "cyber");
    expect(await page.evaluate(() => getComputedStyle(document.body).cursor)).not.toBe("none");
    await ctx.close();
  });
});
