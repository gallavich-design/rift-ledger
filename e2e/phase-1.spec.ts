// Phase 1 smoke test. Requires a synced catalogue (npm run sync:cards) and a build (npm run build).
import { expect, test } from "@playwright/test";

test("misspelled search finds the card in the top 3", async ({ page }) => {
  await page.goto("/cards?q=mastr%20yi%20honned");
  const names = await page.locator("main ul li a span.truncate.font-medium").allTextContents();
  expect(names.slice(0, 3)).toContain("Master Yi - Honed");
});

test("⌘K palette finds a card by typo and opens it", async ({ page }) => {
  await page.goto("/cards");
  await page.keyboard.press("ControlOrMeta+k");
  // Type straight away, as a person does — no keystrokes may be lost while the palette opens.
  await page.keyboard.type("jinks");
  await expect(page.getByRole("textbox", { name: "Search cards, sets and locations" })).toHaveValue("jinks");
  await expect(page.getByRole("option").first()).toContainText("Jinx");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/cards\/.+/);
});

test("card page shows image, rules text, stats and every printing", async ({ page }) => {
  await page.goto("/cards?q=master%20yi%20honed");
  await page.getByRole("link", { name: /Master Yi - Honed/ }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Master Yi - Honed");
  await expect(page.locator("main img").first()).toHaveAttribute("src", /^https:\/\//);
  await expect(page.getByRole("heading", { name: "Rules text" })).toBeVisible();
  await expect(page.getByText("Ganking", { exact: true })).toBeVisible();
  await expect(page.getByText("Energy", { exact: true })).toBeVisible();
  const printings = page.getByRole("heading", { name: "Printings" }).locator("xpath=../..").locator("ul > li");
  expect(await printings.count()).toBeGreaterThanOrEqual(1);
});

test("a new storage location appears in Settings", async ({ page }) => {
  const name = `Binder E2E ${Date.now()}`;
  await page.goto("/settings");
  await page.getByLabel("Name").fill(name);
  await page.getByText("Deck box", { exact: true }).click();
  await page.getByRole("button", { name: "Add location" }).click();
  await expect(page.locator("#locations ul").getByText(name)).toBeVisible();
  // clean up
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator("#locations ul").getByText(name)).toHaveCount(0);
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  for (const path of ["/cards", "/cards?q=yi", "/settings"]) {
    test(`no horizontal scroll at 375px on ${path}`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
  test("no horizontal scroll at 375px on a card page", async ({ page }) => {
    await page.goto("/cards?q=vi%20piltover%20enforcer");
    await page.locator("main ul li a").first().click();
    await page.waitForURL(/\/cards\/.+/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
