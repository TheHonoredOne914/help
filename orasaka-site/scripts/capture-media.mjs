#!/usr/bin/env node
/**
 * Screenshots and short demo recordings of a running build, for review evidence.
 *   node scripts/capture-media.mjs <baseURL> <outDir> [prefix]
 * Writes <prefix>hero-{desktop,mobile}.png, width screenshots, and <prefix>demo-{desktop,mobile}.webm
 * (move → hover → click → scroll → pause → reload → tab return). Convert to mp4 with ffmpeg.
 * Uses CHROME_PATH when set.
 */
import { mkdirSync, renameSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const [base = "http://localhost:3100", outDir = "media", prefix = ""] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ["--no-sandbox"],
});
const errors = [];
const watch = (page) => {
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${page.url()}: ${m.text()}`));
};
const settle = (page) => page.waitForLoadState("networkidle").then(() => page.waitForTimeout(700));

/** Small on-screen step label so a reviewer can follow the recording. */
const caption = (page, text) =>
  page.evaluate((t) => {
    let el = document.getElementById("__cap");
    if (!el) {
      el = document.createElement("div");
      el.id = "__cap";
      el.setAttribute("aria-hidden", "true");
      el.style.cssText =
        "position:fixed;left:12px;bottom:12px;z-index:2147483647;padding:6px 10px;border-radius:6px;background:rgb(0 0 0/.8);color:#fff;font:600 14px/1.2 system-ui;pointer-events:none";
      document.documentElement.append(el);
    }
    el.textContent = t;
  }, text);

/**
 * Leaves the tab and comes back. Playwright keeps automated pages "visible" even when another
 * tab is in front or the window is minimised, so the hidden state is emulated the same way the
 * e2e tests do it (document.hidden + visibilitychange), with an on-screen note.
 */
async function tabAway(page) {
  const set = (h) =>
    page.evaluate((hidden) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
      document.dispatchEvent(new Event("visibilitychange"));
      let veil = document.getElementById("__veil");
      if (hidden && !veil) {
        veil = document.createElement("div");
        veil.id = "__veil";
        veil.setAttribute("aria-hidden", "true");
        veil.textContent = "вкладка скрыта (эмуляция document.hidden)";
        veil.style.cssText =
          "position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;background:rgb(0 0 0/.85);color:#ddd;font:600 18px system-ui;pointer-events:none";
        document.documentElement.append(veil);
      }
      if (!hidden) veil?.remove();
      return document.documentElement.dataset.ambient;
    }, h);
  const whileHidden = await set(true);
  await page.waitForTimeout(1500);
  await set(false);
  return whileHidden;
}

/* ---------- screenshots ---------- */
for (const [name, viewport, dsf, opts] of [
  ["hero-desktop", { width: 1440, height: 900 }, 1, {}],
  ["hero-mobile", { width: 390, height: 844 }, 2, { isMobile: true, hasTouch: true }],
  // Same desktop frame at 2× device pixels, so JPEG softness of the current crop is visible.
  ["hero-dpr2", { width: 1440, height: 900 }, 2, {}],
]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, ...opts });
  const page = await ctx.newPage();
  watch(page);
  await page.goto(base + "/");
  await settle(page);
  await page.screenshot({ path: path.join(outDir, `${prefix}${name}.png`) });
  await ctx.close();
}
for (const width of [360, 768, 1024, 1920]) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 800 : 1000 } });
  const page = await ctx.newPage();
  watch(page);
  await page.goto(base + "/");
  await settle(page);
  await page.screenshot({ path: path.join(outDir, `${prefix}home-${width}.png`) });
  await ctx.close();
}
for (const route of ["account", "support"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  watch(page);
  await page.goto(`${base}/${route}`);
  await settle(page);
  await page.screenshot({ path: path.join(outDir, `${prefix}${route}-desktop.png`) });
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(base + "/");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, `${prefix}hero-mobile-nojs.png`) });
  await ctx.close();
}

/* ---------- recordings ---------- */
async function record(kind) {
  const mobile = kind === "mobile";
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const ctx = await browser.newContext({
    viewport,
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
    recordVideo: { dir: outDir, size: viewport },
  });
  const page = await ctx.newPage();
  watch(page);
  await page.goto(base + "/");
  await settle(page);

  if (mobile) {
    await caption(page, "1. Первый экран (касание, без курсора)");
    await page.waitForTimeout(1200);
    await caption(page, "2. Касание: «Выбрать тариф»");
    await page.getByRole("link", { name: /выбрать тариф/i }).first().tap();
  } else {
    await caption(page, "1. Движение мыши: лёгкий параллакс героини");
    for (let i = 0; i <= 40; i++) await page.mouse.move(200 + i * 28, 250 + Math.sin(i / 5) * 200, { steps: 2 });
    await page.waitForTimeout(400);
    await caption(page, "2. Наведение на кнопку");
    const cta = page.getByRole("link", { name: /выбрать тариф/i }).first();
    const b = await cta.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
    await page.waitForTimeout(900);
    await caption(page, "3. Клик: «Выбрать тариф»");
    await page.mouse.down();
    await page.waitForTimeout(120);
    await page.mouse.up();
  }
  await page.waitForURL(/\/pricing$/);
  await settle(page);
  await page.goBack();
  await settle(page);

  await caption(page, `${mobile ? 3 : 4}. Прокрутка`);
  for (let i = 0; i < 14; i++) {
    await page.evaluate(() => window.scrollBy({ top: 420, behavior: "smooth" }));
    await page.waitForTimeout(260);
  }
  await page.waitForTimeout(500);

  await caption(page, `${mobile ? 4 : 5}. Пауза фоновой анимации`);
  const toggle = page.getByTestId("ambient-toggle");
  await toggle.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  if (mobile) await toggle.tap();
  else await toggle.click();
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await page.waitForTimeout(1200);

  await caption(page, `${mobile ? 5 : 6}. Перезагрузка — пауза сохраняется`);
  await page.waitForTimeout(600);
  await page.reload();
  await settle(page);
  await caption(page, `${mobile ? 5 : 6}. После перезагрузки: пауза включена`);
  await page.waitForTimeout(1200);

  await caption(page, `${mobile ? 6 : 7}. Уход на другую вкладку и возврат`);
  await page.evaluate(() => {
    window.__vis = [];
    document.addEventListener("visibilitychange", () => window.__vis.push(document.visibilityState));
  });
  await page.waitForTimeout(600);
  const state = await tabAway(page);
  await caption(page, `${mobile ? 6 : 7}. Вернулись: пауза не сбросилась`);
  await page.waitForTimeout(1000);
  const paused = await page.evaluate(() => document.documentElement.dataset.ambient);
  const vis = await page.evaluate(() => (window.__vis ?? []).join("→"));

  await caption(page, `${mobile ? 7 : 8}. Снятие паузы`);
  await toggle.scrollIntoViewIfNeeded();
  if (mobile) await toggle.tap();
  else await toggle.click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await page.waitForTimeout(1500);

  const video = page.video();
  await ctx.close();
  const file = path.join(outDir, `${prefix}demo-${kind}.webm`);
  renameSync(await video.path(), file);
  console.log(`${kind}: while away data-ambient=${state} (events: ${vis || "none"}), after return data-ambient=${paused} → ${file}`);
}
await record("desktop");
await record("mobile");
await browser.close();
if (errors.length) {
  console.error("page errors:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("ok, no page/console errors");
