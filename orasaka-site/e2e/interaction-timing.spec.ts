import { type Page } from "@playwright/test";
import { demoLogin, expect, test } from "./support";

/*
 * Lab interaction duration from the Event Timing API (PerformanceEventTiming.duration:
 * from the event to the next paint). Chromium, 4× CPU throttling, localhost.
 * This is not field INP and not a Core Web Vital. Frame rate from the canvas test is not this number.
 */
async function arm(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __evt: { name: string; duration: number }[]; __menuReady: number | null };
    w.__evt = [];
    w.__menuReady = null;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const ev = e as PerformanceEventTiming;
        if (ev.entryType === "event") w.__evt.push({ name: ev.name, duration: ev.duration });
      }
    }).observe({ type: "event", durationThreshold: 0, buffered: true } as PerformanceObserverInit);
    const mark = () => {
      const button = document.querySelector("header button[aria-controls]");
      if (button instanceof HTMLButtonElement && !button.disabled && w.__menuReady == null) w.__menuReady = performance.now();
    };
    // documentElement is not a Node yet when this init script runs.
    new MutationObserver(mark).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["disabled"],
    });
  });
}

async function measure(page: Page, act: () => Promise<void>) {
  const before = await page.evaluate(() => (window as unknown as { __evt: unknown[] }).__evt.length);
  await act();
  await page.waitForTimeout(400);
  const duration = await page.evaluate((n) => {
    const ev = (window as unknown as { __evt: { name: string; duration: number }[] }).__evt.slice(n);
    const hits = ev.filter((e) => e.name === "pointerup" || e.name === "click" || e.name === "keydown");
    if (!hits.length) return { duration: null as number | null, names: ev.map((e) => `${e.name}:${Math.round(e.duration)}`) };
    return { duration: Math.round(Math.max(...hits.map((e) => e.duration))), names: [] as string[] };
  }, before);
  if (duration.duration === null) console.log(`EVENT_TIMING_EMPTY ${JSON.stringify(duration.names)}`);
  return duration.duration;
}

test("event timing: menu, FAQ, plan, dialog (lab, 4× CPU, not field INP)", async ({ page }) => {
  test.skip(test.info().project.name !== "chromium", "CDP CPU throttle is Chromium-only");
  await arm(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const menuButton = page.getByRole("button", { name: "Открыть меню" });
  await expect(menuButton).toBeEnabled();
  const menuReadyMs = await page.evaluate(() => {
    const ready = (window as unknown as { __menuReady: number | null }).__menuReady;
    return ready == null ? null : Math.round(ready);
  });
  console.log(`TIME_TO_MENU_READY ${JSON.stringify({ ms: menuReadyMs, note: "navigation start to enabled menu; not event duration, not field INP" })}`);
  const menu = await measure(page, async () => {
    await menuButton.click();
    await expect(page.getByRole("navigation", { name: "Мобильная навигация" })).toBeVisible();
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/faq");
  const faq = await measure(page, async () => {
    await page.locator("summary").first().click();
    await expect(page.locator("details").first()).toHaveAttribute("open", "");
  });

  await page.goto("/pricing");
  const plan = await measure(page, async () => {
    await page.getByRole("link", { name: "Оформить (демо)" }).first().click();
    await expect(page).toHaveURL(/\/checkout\?plan=/);
  });

  await demoLogin(page);
  await page.locator("select").selectOption("active");
  const dialog = await measure(page, async () => {
    await page.getByRole("button", { name: "Отключить" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  const result = { cpu: "4x", browser: "chromium", lab: true, fieldINP: false, ms: { menu, faq, plan, dialog } };
  console.log(`EVENT_TIMING ${JSON.stringify(result)}`);
  for (const [name, value] of Object.entries(result.ms)) {
    expect(value, name).not.toBeNull();
    expect(value!, `${name} lab event duration`).toBeLessThan(200);
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
});
