import { expect, test } from "@playwright/test";

test.describe("interactive background", () => {
  test("never covers or intercepts the UI", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-fx", "live");
    const canvas = page.locator(".fx-canvas");
    await expect(canvas).toHaveAttribute("data-ready", "true");
    await expect(canvas).toHaveCSS("pointer-events", "none");
    await expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(Number(await canvas.evaluate((el) => getComputedStyle(el).zIndex))).toBeLessThan(0);
    await expect(page.getByTestId("cyber-cursor")).toHaveCSS("pointer-events", "none");

    // Every visible control in the first screen is the topmost element at its own centre.
    const blocked = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("a[href], button")) {
        const r = el.getBoundingClientRect();
        if (el.matches(".sr-only:not(:focus)")) continue;
        if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        if (getComputedStyle(el).visibility === "hidden") continue;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit || !(el === hit || el.contains(hit))) out.push(`${el.tagName} "${el.textContent?.trim().slice(0, 30)}" → ${hit?.className}`);
      }
      return out;
    });
    expect(blocked).toEqual([]);
  });

  test("hero buttons are clickable and lead to the right places", async ({ page }) => {
    await page.goto("/");
    const bot = page.getByRole("link", { name: /^подключиться/i }).first();
    await expect(bot).toHaveAttribute("href", "https://t.me/orasakavpn_bot");
    await page.getByRole("link", { name: /выбрать тариф/i }).first().click();
    await expect(page).toHaveURL(/\/pricing$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("scroll and clicks keep working while the background animates", async ({ page }) => {
    await page.goto("/");
    await page.mouse.move(700, 500);
    await page.mouse.click(700, 500);
    await page.mouse.wheel(0, 1600);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(800);
  });

  test("site still works when canvas cannot start", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = () => null;
      Object.defineProperty(window, "WebGLRenderingContext", { value: undefined });
    });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-fx", "fallback");
    await expect(page.locator(".fx-static")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("link", { name: /выбрать тариф/i }).first().click();
    await expect(page).toHaveURL(/\/pricing$/);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test("stays responsive under 4× CPU throttling", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".fx-canvas")).toHaveAttribute("data-ready", "true");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const measure = page.evaluate(
      () =>
        new Promise<{ fps: number; worst: number }>((resolve) => {
          let frames = 0;
          let worst = 0;
          let last = performance.now();
          const start = last;
          const loop = (t: number) => {
            frames++;
            worst = Math.max(worst, t - last);
            last = t;
            if (t - start < 3000) requestAnimationFrame(loop);
            else resolve({ fps: (frames * 1000) / (t - start), worst });
          };
          requestAnimationFrame(loop);
        }),
    );
    for (let i = 0; i < 60; i++) await page.mouse.move(300 + i * 12, 300 + (i % 10) * 20);
    const { fps, worst } = await measure;
    console.log(`[perf] 4× CPU throttle: fps=${fps.toFixed(1)}, worst frame=${worst.toFixed(0)}ms`);
    expect(fps).toBeGreaterThan(20);
    expect(worst).toBeLessThan(250);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  });
});

test.describe("layout", () => {
  for (const width of [360, 390, 768, 1024, 1440, 1920]) {
    test(`no horizontal overflow at ${width}px`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      for (const path of ["/", "/pricing", "/connect", "/account", "/checkout"]) {
        await page.goto(path);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        expect(overflow, `${path} @ ${width}`).toBeLessThanOrEqual(0);
      }
      await ctx.close();
    });
  }

  test("mobile menu opens, lists navigation and closes with Escape", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Открыть меню" });
    await toggle.click();
    const nav = page.getByRole("navigation", { name: "Мобильная навигация" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: /Тарифы/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(nav).toBeHidden();
    await ctx.close();
  });
});
