import { demoLogin, expect, startPurchase, test } from "./support";

/* Full demo user journeys. TEST money and TEST data only (DEMO_FIXTURES=test, PAYMENTS_MODE=mock). */

test("purchase: demo login → plan → mock payment → provisioning → active subscription", async ({ page }) => {
  await demoLogin(page);
  await expect(page.getByText("Нет подписки")).toBeVisible();

  const keys: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/orders")) keys.push(r.headers()["idempotency-key"]);
  });
  await page.goto("/pricing");
  await page.getByRole("link", { name: "Оформить (демо)" }).first().click();
  await expect(page.locator('input[name="method"]:disabled')).not.toHaveCount(0);
  await page.getByRole("button", { name: "Перейти к оплате" }).dblclick();
  await expect(page).toHaveURL(/\/pay\/mock\//);
  expect(new Set(keys).size, "double submit must reuse one idempotency key").toBe(1);

  await page.getByRole("button", { name: "Оплатить (тест)" }).click();
  await expect(page).toHaveURL(/\/payment\/success\?orderId=/, { timeout: 15_000 });
  // Provisioning is simulated with a delay: the page polls until access is ready.
  await expect(page.getByRole("heading", { name: "Подписка активна" })).toBeVisible({ timeout: 20_000 });

  await page.goto("/account");
  await expect(page.locator("span", { hasText: /^✓Активна$/ }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ссылка подключения" })).toBeVisible();
  await expect(page.locator("a[href^='/checkout/']")).toHaveCount(1);
});

test("cancel at the gateway, then pay again", async ({ page }) => {
  await demoLogin(page);
  await startPurchase(page);
  await page.getByRole("button", { name: "Отменить платёж" }).click();
  await expect(page).toHaveURL(/\/payment\/error\?orderId=/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Платёж не прошёл" })).toBeVisible();
  await expect(page.getByText("Деньги не списаны")).toBeVisible();

  await page.getByRole("link", { name: "Оплатить снова" }).click();
  await expect(page).toHaveURL(/\/checkout\/test-order/);
  await page.getByRole("button", { name: "Оплатить снова" }).click();
  await expect(page).toHaveURL(/\/pay\/mock\//);
  await page.getByRole("button", { name: "Оплатить (тест)" }).click();
  await expect(page.getByRole("heading", { name: "Подписка активна" })).toBeVisible({ timeout: 20_000 });
});

test("reload and back navigation never re-charge or fake a status", async ({ page }) => {
  await demoLogin(page);
  const orderId = await startPurchase(page);
  await page.getByRole("button", { name: "Оплатить (тест)" }).click();
  await expect(page.getByRole("heading", { name: "Подписка активна" })).toBeVisible({ timeout: 20_000 });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Подписка активна" })).toBeVisible({ timeout: 10_000 });

  // Back to the gateway: the payment is already completed, no second pay button.
  await page.goBack();
  await expect(page).toHaveURL(/\/pay\/mock\//);
  await expect(page.getByText("Платёж проведён")).toBeVisible();
  await expect(page.getByRole("button", { name: "Оплатить (тест)" })).toHaveCount(0);

  // The order page no longer offers payment.
  await page.goto(`/checkout/${orderId}`);
  await expect(page.getByRole("button", { name: /Оплатить/ })).toHaveCount(0);

  // Return URL parameters are ignored: the status comes from the server.
  const unpaid = await startPurchase(page, 1);
  await page.goto(`/payment/success?orderId=${unpaid}&status=success`);
  await expect(page.getByRole("heading", { name: "Платёж ещё не подтверждён" })).toBeVisible();
  await page.goto(`/payment/return?orderId=${unpaid}&status=succeeded&paid=1`);
  await expect(page.getByRole("heading", { name: "Подписка активна" })).toHaveCount(0);
});

test("another visitor cannot open someone else's order", async ({ page, browser, allowConsole }) => {
  // The second visitor's pages ask the BFF for a foreign order and legitimately get 404.
  allowConsole(/status of 404 \(Not Found\) \(http:\/\/[^)]+\/api\/orders\//);
  await demoLogin(page);
  const orderId = await startPurchase(page);

  const other = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await other.newPage();
  const errors: string[] = [];
  p2.on("pageerror", (e) => errors.push(e.message));
  await p2.goto("/account");
  await p2.getByRole("button", { name: "Войти в демо-кабинет" }).click();
  await expect(p2.getByText("Демо-пользователь")).toBeVisible();
  for (const path of [`/checkout/${orderId}`, `/payment/success?orderId=${orderId}`, `/payment/return?orderId=${orderId}`]) {
    await p2.goto(path);
    await expect(p2.getByText(/Заказ не найден|Не найдено/).first(), path).toBeVisible();
    await expect(p2.getByText(orderId)).toHaveCount(0);
  }
  expect(errors).toEqual([]);
  await other.close();
});

test("dialogs: keyboard, Escape and focus return", async ({ page }) => {
  await demoLogin(page);
  const orderId = await startPurchase(page);
  await page.goto(`/checkout/${orderId}`);
  const cancel = page.getByRole("button", { name: "Отменить заказ" });
  await cancel.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Focus is inside the dialog.
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(cancel).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Отменить заказ" }).click();
  await expect(page.getByText("Отменён").first()).toBeVisible();
});

test("account: device removal, presets and logout", async ({ page }) => {
  await demoLogin(page);
  await page.locator("select").selectOption("active");
  await expect(page.getByRole("button", { name: "Отключить" })).toHaveCount(2);
  await page.getByRole("button", { name: "Отключить" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Отключить" }).click();
  await expect(page.getByText("Устройство отключено.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Отключить" })).toHaveCount(1);

  await page.locator("select").selectOption("provisioning");
  await expect(page.getByText("◷Доступ готовится")).toBeVisible();
  await page.locator("select").selectOption("empty");
  await expect(page.getByText("Нет подписки")).toBeVisible();

  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page.getByRole("button", { name: "Войти в демо-кабинет" })).toBeVisible();
});

test("keyboard: skip link and visible focus", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Перейти к содержимому" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe("none");
});
