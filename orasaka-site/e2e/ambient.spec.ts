import { type Page } from "@playwright/test";
import { expect, test } from "./support";

/*
 * The footer "pause background animation" toggle must stop the Canvas draw loop itself,
 * not only CSS loops. These checks look at the canvas pixels, not just at HTML attributes.
 */

const snapshot = (page: Page) => page.locator(".fx-canvas").evaluate((c: HTMLCanvasElement) => c.toDataURL());

/** A paused background must still be a composed image, not an empty/black canvas. */
const distinctColours = (page: Page) =>
  page.locator(".fx-canvas").evaluate((c: HTMLCanvasElement) => {
    const g = c.getContext("2d")!;
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return seen.size;
  });

async function wiggle(page: Page, ms = 700) {
  const end = Date.now() + ms;
  let i = 0;
  while (Date.now() < end) {
    await page.mouse.move(400 + ((i * 37) % 600), 300 + ((i * 23) % 300));
    await page.waitForTimeout(30);
    i++;
  }
}

async function expectFrozen(page: Page) {
  const a = await snapshot(page);
  await wiggle(page);
  await page.mouse.click(700, 420);
  await page.waitForTimeout(300);
  expect(await snapshot(page), "canvas changed while background should be stopped").toBe(a);
  expect(await distinctColours(page), "stopped background must keep a composed static frame").toBeGreaterThan(20);
}

async function expectAnimating(page: Page) {
  await expect(page.locator(".fx-canvas")).toHaveAttribute("data-running", "true");
  const a = await snapshot(page);
  await wiggle(page, 500);
  expect(await snapshot(page)).not.toBe(a);
}

const toggle = (page: Page) => page.getByTestId("ambient-toggle");

async function pause(page: Page) {
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".fx-canvas")).toHaveAttribute("data-running", "false");
  await expect(page.locator("html")).toHaveAttribute("data-ambient", "paused");
}

test.describe("background animation toggle controls the Canvas", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".fx-canvas")).toHaveAttribute("data-ready", "true");
  });

  test("pause stops drawing, keeps a static frame, survives reload, resume works", async ({ page }) => {
    await expectAnimating(page);
    await pause(page);
    await expect(page.locator("html")).toHaveAttribute("data-fx", "paused");
    await expectFrozen(page);

    await page.reload();
    await expect(page.locator(".fx-canvas")).toHaveAttribute("data-ready", "true");
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".fx-canvas")).toHaveAttribute("data-running", "false");
    await expectFrozen(page);

    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("html")).toHaveAttribute("data-ambient", "on");
    await expectAnimating(page);
  });

  test("hidden → visible tab does not restart a paused background", async ({ page }) => {
    await pause(page);
    const setHidden = (hidden: boolean) =>
      page.evaluate((h) => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
        document.dispatchEvent(new Event("visibilitychange"));
      }, hidden);
    await setHidden(true);
    await setHidden(false);
    await expect(page.locator(".fx-canvas")).toHaveAttribute("data-running", "false");
    await expect(page.locator("html")).toHaveAttribute("data-ambient", "paused");
    await expectFrozen(page);
  });

  test("unpaused background stops on hidden tab and resumes on return", async ({ page }) => {
    const setHidden = (hidden: boolean) =>
      page.evaluate((h) => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
        document.dispatchEvent(new Event("visibilitychange"));
      }, hidden);
    await setHidden(true);
    await expect(page.locator(".fx-canvas")).toHaveAttribute("data-running", "false");
    await setHidden(false);
    await expectAnimating(page);
  });

  test("resize, route change and media-query change keep the pause", async ({ page }) => {
    await pause(page);
    await page.setViewportSize({ width: 1100, height: 760 });
    await page.waitForTimeout(200);
    await expect(page.locator(".fx-canvas")).toHaveAttribute("data-running", "false");
    await expectFrozen(page);

    await page.getByRole("navigation", { name: "Основная навигация" }).getByRole("link", { name: "Тарифы" }).click();
    await expect(page).toHaveURL(/\/pricing$/);
    await page.waitForTimeout(300);
    await expect(page.locator(".fx-canvas")).toHaveAttribute("data-running", "false");
    await expectFrozen(page);

    // Crossing the mobile breakpoint recreates the engine; it must come back paused.
    await page.setViewportSize({ width: 700, height: 900 });
    await page.waitForTimeout(300);
    await expect(page.locator(".fx-canvas")).toHaveAttribute("data-running", "false");
    await expectFrozen(page);
  });

  test("CSS loops pause together with the canvas", async ({ page }) => {
    await expect.poll(() => runningLoops(page), { message: "hero breathing + glow run before pause" }).toEqual(
      expect.arrayContaining(["bi-breathe", "bi-glow"]),
    );
    await toggle(page).evaluate((el: HTMLElement) => el.click());
    await expect(page.locator("html")).toHaveAttribute("data-ambient", "paused");
    await expect(page.getByTestId("brand-hero")).toHaveAttribute("data-onscreen", "true");
    expect(await runningLoops(page)).toEqual([]);
  });

  test("hero loops stop on a hidden tab and when scrolled away, and resume", async ({ page }) => {
    const setHidden = (hidden: boolean) =>
      page.evaluate((h) => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
        document.dispatchEvent(new Event("visibilitychange"));
      }, hidden);
    await setHidden(true);
    await expect.poll(() => runningLoops(page)).toEqual([]);
    await setHidden(false);
    await expect.poll(() => runningLoops(page)).toContain("bi-breathe");

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByTestId("brand-hero")).toHaveAttribute("data-onscreen", "false");
    await expect.poll(() => runningLoops(page)).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => runningLoops(page)).toContain("bi-breathe");
  });

  test("pause resets the hero parallax", async ({ page }) => {
    const hero = page.getByTestId("brand-hero");
    const px = () => hero.evaluate((el) => Number(el.style.getPropertyValue("--px") || 0));
    let i = 0;
    await expect
      .poll(async () => {
        await page.mouse.move(1380 + (i++ % 2) * 20, 860);
        return px();
      })
      .toBeGreaterThan(0.5);
    // A programmatic click keeps the hero on screen (a click would scroll to the footer toggle).
    await toggle(page).evaluate((el: HTMLElement) => el.click());
    await expect(page.locator("html")).toHaveAttribute("data-ambient", "paused");
    await expect(hero).toHaveAttribute("data-onscreen", "true");
    await expect.poll(px).toBe(0);
    await page.mouse.move(1400, 880, { steps: 3 });
    await page.waitForTimeout(150);
    expect(await px()).toBe(0);
  });
});

/** Infinite CSS loops currently running, by element class (scroll-driven animations excluded). */
const runningLoops = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter(
        (a) =>
          a instanceof CSSAnimation &&
          a.playState === "running" &&
          a.effect?.getTiming().iterations === Infinity &&
          a.timeline === document.timeline,
      )
      .map((a) => String(((a.effect as KeyframeEffect).target as HTMLElement).className).split(" ").find((c) => c.startsWith("bi-")) ?? "other"),
  );

test("hero motion does not shift layout or cover the face and actions", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("brand-hero")).toBeVisible();
    const read = () =>
      page.evaluate(() => {
        const hero = document.querySelector("[data-testid=brand-hero]")!.getBoundingClientRect();
        const img = document.querySelector("[data-testid=brand-hero] img")!.getBoundingClientRect();
        const face = { x: img.x, y: img.y, w: img.width, h: img.height * 0.42 };
        const nodes = [...document.querySelectorAll("a, button")].filter((el) => {
          const s = getComputedStyle(el);
          if (s.visibility === "hidden" || el.getAttribute("aria-hidden") === "true") return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        const hits = nodes
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.left < face.x + face.w && r.right > face.x && r.top < face.y + face.h && r.bottom > face.y;
          })
          .map((el) => (el.textContent ?? "").trim().slice(0, 40));
        const cta = document.querySelector("main a[href*='t.me']")!.getBoundingClientRect();
        return {
          hero: { x: hero.x, y: hero.y, w: hero.width, h: hero.height },
          cta: { x: cta.x, y: cta.y, w: cta.width, h: cta.height },
          hits,
        };
      });
    const before = await read();
    await page.waitForTimeout(700);
    const after = await read();
    expect(Math.abs(before.hero.y - after.hero.y), `hero y ${viewport.width}`).toBeLessThan(1);
    expect(Math.abs(before.hero.h - after.hero.h), `hero h ${viewport.width}`).toBeLessThan(1);
    expect(before.hits, `controls over the face ${viewport.width}`).toEqual([]);
    expect(after.hits, `controls over the face after motion ${viewport.width}`).toEqual([]);
    const separate =
      before.cta.x + before.cta.w <= before.hero.x ||
      before.hero.x + before.hero.w <= before.cta.x ||
      before.cta.y + before.cta.h <= before.hero.y ||
      before.hero.y + before.hero.h <= before.cta.y;
    expect(separate, `CTA clear of the portrait ${viewport.width}`).toBe(true);
  }
});

test("reduced motion switched on after load stops the canvas and the loops", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".fx-canvas")).toHaveAttribute("data-running", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-fx", "static");
  await expect(page.locator(".fx-canvas")).toHaveAttribute("data-running", "false");
  await expect.poll(() => runningLoops(page)).toEqual([]);
  await expect(page.locator('[data-reveal="pending"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test.describe("edge cases", () => {
  test("reduced motion never starts the loop, even with the toggle on", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-fx", "static");
    await expect(page.locator(".fx-canvas")).toHaveAttribute("data-running", "false");
    await expectFrozen(page);
    await toggle(page).click();
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".fx-canvas")).toHaveAttribute("data-running", "false");
    await expectFrozen(page);
    await ctx.close();
  });

  test("throwing localStorage does not break the page or the toggle", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new DOMException("denied", "SecurityError");
      };
      Storage.prototype.setItem = () => {
        throw new DOMException("quota", "QuotaExceededError");
      };
    });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.locator(".fx-canvas")).toHaveAttribute("data-running", "true");
    await pause(page);
    await expectFrozen(page);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});
