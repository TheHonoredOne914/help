// Field-style metrics in headless Chrome against a running production build:
//   node scripts/perf-measure.mjs [baseUrl]   (default http://localhost:3100, demo + mock build)
// LCP and CLS come from PerformanceObserver, interaction latency from the Event Timing API
// (the longest event duration per interaction, as INP does). Every scenario runs without
// throttling and with 4× CPU throttling (CDP Emulation.setCPUThrottlingRate). This is not a
// real-device measurement.
import { chromium } from "@playwright/test";

const base = process.argv[2] || "http://localhost:3100";
const RUNS = 3;

const OBSERVE = () => {
  window.__perf = { lcp: 0, cls: 0, events: [] };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__perf.lcp = e.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.interactionId) window.__perf.events.push({ id: e.interactionId, name: e.name, d: e.duration });
  }).observe({ type: "event", buffered: true, durationThreshold: 16 });
};

const scenarios = [
  { name: "home: mobile menu + ambient toggle", path: "/", mobile: true, act: async (p) => {
    const menu = p.locator("header button[aria-controls][data-hydrated]");
    await menu.click();
    await p.waitForTimeout(400);
    await menu.click();
    const toggle = p.locator("[data-testid=ambient-toggle]:visible").first();
    if (await toggle.count()) await toggle.click();
  } },
  { name: "faq: open 3 questions", path: "/faq", mobile: false, act: async (p) => {
    const s = p.locator("details summary");
    for (let i = 0; i < 3; i++) { await s.nth(i).click(); await p.waitForTimeout(150); }
  } },
  { name: "checkout: switch plan + method", path: "/checkout", mobile: false, act: async (p) => {
    const radios = p.getByRole("radio");
    const n = await radios.count();
    for (let i = 0; i < Math.min(n, 4); i++) { await radios.nth(i).check({ force: true }); await p.waitForTimeout(150); }
  } },
  { name: "pricing: load only", path: "/pricing", mobile: true, act: async () => {} },
];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
console.log(`Chrome ${browser.version()} · base ${base} · ${RUNS} runs each, median shown`);
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

for (const throttle of [1, 4]) {
  for (const s of scenarios) {
    const lcp = [], cls = [], inp = [];
    for (let r = 0; r < RUNS; r++) {
      const ctx = await browser.newContext(s.mobile
        ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
        : { viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
      await page.addInitScript(OBSERVE);
      await page.goto(base + s.path, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      await s.act(page);
      await page.waitForTimeout(600);
      const m = await page.evaluate(() => {
        const per = new Map();
        for (const e of window.__perf.events) per.set(e.id, Math.max(per.get(e.id) || 0, e.d));
        return { lcp: window.__perf.lcp, cls: window.__perf.cls, inp: Math.max(0, ...per.values()) };
      });
      lcp.push(m.lcp); cls.push(m.cls); inp.push(m.inp);
      await ctx.close();
    }
    console.log(`${throttle}× CPU | ${s.name.padEnd(36)} | LCP ${Math.round(median(lcp))} ms | CLS ${median(cls).toFixed(3)} | worst interaction ${Math.round(median(inp))} ms (max ${Math.round(Math.max(...inp))})`);
  }
}
await browser.close();
