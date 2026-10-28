import { expect, test as base, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * Every test is watched automatically: page errors and console errors from the default page,
 * from any extra page, and from any context created via `browser.newContext()`/`newPage()`
 * fail the test. A test may allow specific expected errors with `allowConsole(/…/)`.
 * Specs must import `test` from this file (not from @playwright/test).
 */
export const test = base.extend<{ allowConsole: (re: RegExp) => void; consoleGuard: (re: RegExp) => void }>({
  consoleGuard: [
    async ({ context, browser }, provide) => {
      const errors: string[] = [];
      const allowed: RegExp[] = [];
      const seen = new WeakSet<Page>();
      const watchPage = (p: Page) => {
        if (seen.has(p)) return;
        seen.add(p);
        p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
        p.on("console", (m) => {
          if (m.type() === "error") errors.push(`console: ${m.text()} (${m.location().url})`);
        });
      };
      const watchContext = (c: BrowserContext) => {
        c.pages().forEach(watchPage);
        c.on("page", watchPage);
      };
      watchContext(context);

      const b = browser as Browser & { newContext: Browser["newContext"]; newPage: Browser["newPage"] };
      const { newContext, newPage } = b;
      b.newContext = async (...args) => {
        const c = await newContext.apply(b, args);
        watchContext(c);
        return c;
      };
      b.newPage = async (...args) => {
        const p = await newPage.apply(b, args);
        watchContext(p.context());
        return p;
      };

      try {
        await provide((re) => allowed.push(re));
      } finally {
        b.newContext = newContext;
        b.newPage = newPage;
      }
      const unexpected = errors.filter((e) => !allowed.some((re) => re.test(e)));
      expect(unexpected, "unexpected page/console errors").toEqual([]);
    },
    { auto: true },
  ],
  allowConsole: async ({ consoleGuard }, provide) => {
    await provide(consoleGuard);
  },
});

export { expect };

export async function demoLogin(page: Page) {
  await page.goto("/account");
  await page.getByRole("button", { name: "Войти в демо-кабинет" }).click();
  await expect(page.getByText("Демо-пользователь")).toBeVisible();
}

/** pricing → checkout → mock gateway. Returns the gateway payment's order id. */
export async function startPurchase(page: Page, nth = 0) {
  await page.goto("/pricing");
  await page.getByRole("link", { name: "Оформить (демо)" }).nth(nth).click();
  await expect(page).toHaveURL(/\/checkout\?plan=/);
  await page.getByRole("button", { name: "Перейти к оплате" }).click();
  await expect(page).toHaveURL(/\/pay\/mock\//);
  await expect(page.getByText("тестовый платёжный шлюз").first()).toBeVisible();
  const text = (await page.getByText(/· заказ /).textContent()) ?? "";
  return text.split("· заказ ")[1].trim();
}
