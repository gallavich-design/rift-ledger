// Phase 3 — Definition of Done for decks. Runs serially on prisma/e2e.db (npm run e2e).
import { expect, test, type Page } from "@playwright/test";
import { legalList } from "./helpers";

test.describe.configure({ mode: "serial" });


const row = (page: Page, section: string, name: string) => page.getByTestId(`section-${section}`).getByTestId("deck-row").filter({ hasText: name });

let deckUrl = "";

test("pasting a decklist creates the deck and lists every unrecognised line", async ({ page }) => {
  const list = await legalList();
  await page.goto("/decks/new");
  await page.getByLabel("Deck name").fill("E2E Test Deck");
  await page.getByLabel("Decklist", { exact: true }).fill(`${list.text}\nSideboard:\n2 Definitely Not A Card\n1 Qqqq Zzzz`);
  await page.getByRole("button", { name: "Import deck" }).click();
  await expect(page).toHaveURL(/\/decks\/(?!new$)[^/]+$/);
  deckUrl = page.url();
  await expect(page.getByTestId("pending-line")).toHaveCount(2);
  await expect(page.getByTestId("pending-import")).toContainText("2 Definitely Not A Card");
  await expect(page.getByTestId("pending-import")).toContainText("1 Qqqq Zzzz");
  // the recognised cards made it in and the deck is legal
  await expect(page.getByTestId("legal-badge")).toHaveText("Legal");
  // fixing: dismiss both lines
  for (let i = 0; i < 2; i++) {
    await page.getByTestId("pending-line").first().getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByTestId("pending-line")).toHaveCount(1 - i);
  }
  await expect(page.getByTestId("pending-import")).toHaveCount(0);
});

test("breaking a rule shows a specific error; fixing it clears the error", async ({ page }) => {
  const list = await legalList();
  await page.goto(deckUrl);
  await expect(page.getByTestId("legal-badge")).toHaveText("Legal");

  // copy limit: a 4th copy
  const card = list.main[0];
  await row(page, "MAIN", card).getByRole("button", { name: `One more ${card}` }).click();
  await expect(page.getByTestId("legality")).toContainText(`4 copies of ${card} across your Chosen Champion, main deck and sideboard — the limit is 3.`);
  await row(page, "MAIN", card).getByRole("button", { name: `One fewer ${card}` }).click();
  await expect(page.getByTestId("legality")).toContainText("Legal in Standard");

  // rune deck: 11 runes
  const rune = list.runes[0];
  await row(page, "RUNES", rune).getByRole("button", { name: `One fewer ${rune}` }).click();
  await expect(page.getByTestId("legality")).toContainText("Rune deck has 11 runes — it needs exactly 12. Add 1.");
  await row(page, "RUNES", rune).getByRole("button", { name: `One more ${rune}` }).click();
  await expect(page.getByTestId("legality")).toContainText("Legal in Standard");

  // main deck size: drop to 37
  await row(page, "MAIN", card).getByRole("button", { name: `One fewer ${card}` }).click();
  await row(page, "MAIN", card).getByRole("button", { name: `One fewer ${card}` }).click();
  await row(page, "MAIN", card).getByRole("button", { name: `One fewer ${card}` }).click();
  await expect(page.getByTestId("legality")).toContainText("Main deck has 37 cards (with your Chosen Champion) — it needs at least 40. Add 3.");
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByTestId("legal-badge")).toHaveText("Legal");
});

test("budget build is never more than the normal build and lists each swap", async ({ page }) => {
  await page.goto(deckUrl);
  const money = (s: string | null) => Number((s ?? "").replace(/[^\d.]/g, ""));
  const cost = page.getByTestId("cost");
  const value = money(await cost.locator("dd").first().textContent());
  const budget = money(await page.getByTestId("budget-value").textContent());
  expect(budget).toBeLessThanOrEqual(value);
  expect(money(await page.getByTestId("budget-to-complete").textContent())).toBeLessThanOrEqual(money(await page.getByTestId("cost-to-complete").textContent()));
  if (budget < value) {
    await page.getByTestId("swaps").locator("summary").click();
    await expect(page.getByTestId("swaps").locator("li").first()).toContainText("→");
  }
});

test("editing a deck creates a new version with a correct +/− diff", async ({ page }) => {
  const list = await legalList();
  await page.goto(deckUrl);
  const [a, b] = list.main;
  await row(page, "MAIN", a).getByRole("button", { name: `One fewer ${a}` }).click();
  await row(page, "MAIN", a).getByRole("button", { name: `One fewer ${a}` }).click();
  await row(page, "MAIN", b).getByRole("button", { name: `One fewer ${b}` }).click();
  // add 3 copies of a card that isn't in the deck yet, through the adder
  const extra = list.spare;
  for (let i = 0; i < 3; i++) {
    await page.getByPlaceholder("Add a card — type a name, Enter adds one copy").fill(extra);
    await page.locator("#deck-add-hits [role=option]").filter({ hasText: extra }).first().click();
  }
  const expected = [`−2 ${a}`, `−1 ${b}`].sort((x, y) => x.slice(3).localeCompare(y.slice(3))).join(", ") + `, +3 ${extra}`;
  await expect(page.getByTestId("unsaved")).toHaveText(expected);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Saved as version 2\./)).toBeVisible();
  await expect(page.getByTestId("versions").getByTestId("version-diff").first()).toHaveText(expected);
});

test("logging 5 matches shows win rate overall and by opponent Legend", async ({ page }) => {
  await page.goto(deckUrl);
  const games: [string, "Win" | "Loss" | "Draw"][] = [
    ["Card Villain A", "Win"],
    ["Card Villain A", "Win"],
    ["Card Villain A", "Loss"],
    ["Card Villain B", "Win"],
    ["Card Villain B", "Draw"],
  ];
  for (const [n, [opp, res]] of games.entries()) {
    await page.getByLabel("Opponent's Legend").fill(opp);
    await page.getByRole("form", { name: "Log a match" }).getByText(res, { exact: true }).click();
    await page.getByRole("button", { name: "Log match" }).click();
    await expect(page.getByText(`All ${n + 1} matches`)).toBeVisible();
  }
  await expect(page.getByTestId("winrate-overall")).toContainText("60%");
  await expect(page.getByTestId("winrate-overall")).toContainText("3W · 1L · 1D — 5 games");
  const rows = page.getByTestId("winrate-by-legend").locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText(/Card Villain A\s*3\s*2–1–0\s*67%/);
  await expect(rows.nth(1)).toContainText(/Card Villain B\s*2\s*1–0–1\s*50%/);
});

test("decks list, share link and text export work", async ({ page }) => {
  await page.goto("/decks");
  await expect(page.getByTestId("deck-card").filter({ hasText: "E2E Test Deck" })).toBeVisible();
  await page.goto(deckUrl);
  await page.getByRole("button", { name: "Create share link" }).click();
  const link = await page.getByLabel("Share link").inputValue();
  expect(link).toMatch(/\/share\/deck\/[\w-]+$/);
  const shared = await page.context().newPage();
  await shared.goto(link);
  await expect(shared.getByRole("heading", { level: 1 })).toHaveText("E2E Test Deck");
  await expect(shared.locator("main")).not.toContainText("฿");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Text" }).click()]);
  expect(download.suggestedFilename()).toBe("E2E-Test-Deck.txt");
  // Image: the card-grid PNG, made on the server
  const [png] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), page.getByTestId("export-image").click()]);
  expect(png.suggestedFilename()).toBe("E2E-Test-Deck.png");
  const bytes = await (await import("node:fs/promises")).readFile((await png.path())!);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  expect(bytes.readUInt32BE(16)).toBe(1080); // width from the IHDR chunk
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test("no horizontal scroll at 375px on the deck pages", async ({ page }) => {
    for (const p of ["/decks", "/decks/new", deckUrl.replace(/^https?:\/\/[^/]+/, "")]) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), p).toBeLessThanOrEqual(0);
    }
  });
});
