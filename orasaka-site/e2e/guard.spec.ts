import { expect, test } from "./support";

/*
 * Self-test of the automatic console/pageerror guard in ./support. `test.fail()` inverts the
 * result: these pass only if the guard really fails a test on an unexpected error.
 */
const THROW = "<script>throw new Error('guard-self-test')</script>";

test.describe("console guard self-check (expected failure)", () => {
  test("self-check, expected failure: an unexpected page error fails the test", async ({ page }) => {
    test.fail();
    await page.setContent(THROW);
  });

  test("self-check, expected failure: an unexpected console.error fails the test", async ({ page }) => {
    test.fail();
    await page.setContent("<script>console.error('guard-self-test')</script>");
  });

  test("self-check, expected failure: errors in an extra page of the same context are caught", async ({ context }) => {
    test.fail();
    const p = await context.newPage();
    await p.setContent(THROW);
  });

  test("self-check, expected failure: errors in a context created by the test are caught", async ({ browser }) => {
    test.fail();
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.setContent(THROW);
    await ctx.close();
  });

  test("self-check, expected failure: errors from browser.newPage() are caught", async ({ browser }) => {
    test.fail();
    const p = await browser.newPage();
    await p.setContent(THROW);
    await p.close();
  });

  test("an error allowed by the scenario does not fail the test", async ({ page, allowConsole }) => {
    allowConsole(/guard-self-test/);
    await page.setContent(THROW);
    await expect(page.locator("body")).toBeAttached();
  });
});
