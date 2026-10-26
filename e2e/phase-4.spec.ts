// Phase 4 — rulings, alerts, rotation, meta and watchlist. Runs serially on prisma/e2e.db.
import { expect, test, type Page } from "@playwright/test";
import { addDays, db, legalList, today } from "./helpers";

test.describe.configure({ mode: "serial" });

async function importDeck(page: Page, name: string, text: string) {
  await page.goto("/decks/new");
  await page.getByLabel("Deck name").fill(name);
  await page.getByLabel("Decklist", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Import deck" }).click();
  await expect(page).toHaveURL(/\/decks\/(?!new$)[^/]+$/);
  return page.url();
}

async function addRuling(page: Page, opts: { type: "Errata" | "Ban" | "Rotation"; title: string; date?: string; card?: string; setCode?: string; newText?: (old: string) => string }) {
  await page.goto("/news/new");
  await page.getByText(opts.type, { exact: true }).click();
  await page.getByLabel("Title").fill(opts.title);
  if (opts.date) await page.getByLabel("Takes effect").fill(opts.date);
  if (opts.card) {
    await page.getByPlaceholder("Type a card name").fill(opts.card);
    await page.getByRole("option").filter({ hasText: opts.card }).first().getByRole("button").click();
    await expect(page.getByRole("button", { name: `Remove ${opts.card}` })).toBeVisible();
  }
  if (opts.setCode) await page.getByLabel("Set leaving Standard").selectOption(opts.setCode);
  if (opts.newText) {
    const oldBox = page.getByLabel("Old text");
    await expect(oldBox).not.toHaveValue("");
    await page.getByLabel("New text").fill(opts.newText(await oldBox.inputValue()));
  }
  await page.getByRole("button", { name: "Save ruling" }).click();
  await expect(page).toHaveURL(/\/news\/[^/]+\?saved=/);
  return page.url().split("?")[0];
}

async function deleteRuling(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole("button", { name: "Delete ruling" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/news\?tab=rulings/);
}

let deckUrl = "";
let list: Awaited<ReturnType<typeof legalList>>;

test("a ban on a card in my deck creates an alert and marks the deck not legal", async ({ page }) => {
  list = await legalList();
  deckUrl = await importDeck(page, "E2E Rulings Deck", list.text);
  await expect(page.getByTestId("legal-badge")).toHaveText("Legal");

  const card = list.main[0];
  const ruling = await addRuling(page, { type: "Ban", title: "E2E ban list", card });
  await expect(page.getByRole("status")).toContainText("1 alert sent");

  await page.goto("/news");
  await expect(page.getByTestId("alert").first()).toContainText(`${card} banned on ${today}`);
  await expect(page.getByTestId("unread-badge")).toBeVisible();

  await page.goto(deckUrl);
  await expect(page.getByTestId("legal-badge")).not.toHaveText("Legal");
  await expect(page.getByTestId("legality")).toContainText(`${card} is banned.`);
  await expect(page.getByTestId("deck-notices")).toContainText(`${card} banned — deck no longer legal`);

  // unbanning (deleting the ban) makes it legal again
  await deleteRuling(page, ruling);
  await page.goto(deckUrl);
  await expect(page.getByTestId("legal-badge")).toHaveText("Legal");
});

test("an errata shows the old vs new text diff on the card page", async ({ page }) => {
  const card = await db.card.findFirst({ where: { name: list.main[1] } });
  await addRuling(page, { type: "Errata", title: "E2E errata", card: card!.name, newText: (old) => `${old} Then draw 1.` });
  await page.goto(`/cards/${card!.id}`);
  const diff = page.getByTestId("errata-diff");
  await expect(diff).toBeVisible();
  await expect(diff.locator("ins")).toContainText("Then");
  await expect(diff.locator("ins")).toContainText("1.");
  await page.goto(deckUrl);
  await expect(page.getByTestId("deck-notices")).toContainText(`1 card in this deck errata'd on ${today}`);
});

test("a rotation date shows 'rotates in N months' on decks and the rotating value on the dashboard", async ({ page }) => {
  // own a copy of the deck's Legend so there's something in the portfolio from that set
  const legend = await db.card.findFirst({ where: { name: list.legend }, include: { set: true, variants: { where: { priceSnapshots: { some: {} } }, take: 1 } } });
  const variant = legend!.variants[0] ?? (await db.cardVariant.findFirst({ where: { cardId: legend!.id } }));
  await page.goto(`/collection/add?variant=${variant!.id}`);
  await page.getByLabel("Bought from").fill("Local shop");
  await page.getByLabel("Price each").fill("100");
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page).toHaveURL(/saved=1/);

  const date = addDays(today, 95);
  const ruling = await addRuling(page, { type: "Rotation", title: "E2E rotation", date, setCode: legend!.set.code });
  await page.goto(deckUrl);
  await expect(page.getByTestId("deck-notices")).toContainText(/rotates? in 3 months/);
  await page.goto(`/cards/${legend!.id}`);
  await expect(page.getByTestId("rotation-chip")).toHaveText(`${legend!.set.code} rotates in 3 months`);
  await page.goto("/dashboard");
  const rot = page.getByTestId("rotation-value").locator("p").filter({ hasText: date });
  await expect(rot).toContainText(legend!.set.code);
  await expect(rot).toContainText("rotate in 3 months");
  await expect(rot).toContainText(/[฿$€][\d,]+\.\d{2}/);
  await deleteRuling(page, ruling);
});

test("importing 3 meta decks shows % owned and cost to complete, and sorting by cheapest works", async ({ page }) => {
  // three lists of very different cost: the e2e deck, a cheap-cards list, a pricier one
  const cheap = await db.priceSnapshot.findMany({ where: { source: "TCGPLAYER", market: { lt: 30 } }, include: { variant: { include: { card: true } } }, take: 300 });
  const dear = await db.priceSnapshot.findMany({ where: { source: "TCGPLAYER", market: { gt: 2000 } }, include: { variant: { include: { card: true } } }, take: 300 });
  const names = (rows: typeof cheap) => [...new Set(rows.map((r) => r.variant.card.name).filter((n) => !n.includes("//") && !n.includes("(")))].slice(0, 5);
  const lists = [
    { archetype: "E2E Meta Owned", text: list.text },
    { archetype: "E2E Meta Cheap", text: names(cheap).map((n) => `3 ${n}`).join("\n") },
    { archetype: "E2E Meta Dear", text: names(dear).map((n) => `3 ${n}`).join("\n") },
  ];
  for (const l of lists) {
    await page.goto("/meta/import");
    await page.getByLabel("Archetype").fill(l.archetype);
    await page.getByLabel("Event").fill("E2E Regional");
    await page.getByLabel("Decklist").fill(l.text);
    await page.getByRole("button", { name: "Import list" }).click();
    await expect(page).toHaveURL(/\/meta\/(?!import)[^/]+$/);
  }
  await page.goto("/meta?sort=cheapest");
  const rows = page.getByTestId("meta-row");
  await expect(rows).toHaveCount(3);
  for (const r of await rows.all()) await expect(r.getByTestId("meta-owned")).toHaveText(/^\d+%$/);
  const money = async () => (await page.getByTestId("meta-cost").allTextContents()).map((t) => Number(t.replace(/[^\d.]/g, "")));
  const costs = await money();
  expect(costs).toEqual([...costs].sort((a, b) => a - b));
  expect(await page.getByTestId("meta-archetype").allTextContents()).toEqual(["E2E Meta Cheap", "E2E Meta Owned", "E2E Meta Dear"]);
  // % owned sort: the list containing the owned Legend comes first
  await page.getByRole("link", { name: "% owned" }).click();
  await expect(page).toHaveURL(/sort=owned/);
  await expect(page.getByRole("link", { name: "% owned" })).toHaveAttribute("aria-current", "true");
  const owned = (await page.getByTestId("meta-owned").allTextContents()).map((t) => Number(t.replace("%", "")));
  expect(owned).toEqual([...owned].sort((a, b) => b - a));
});

test("a watchlist alert fires when a manual price crosses its target", async ({ page }) => {
  const snap = await db.priceSnapshot.findFirst({ where: { source: "TCGPLAYER", market: { gt: 500 }, variant: { watches: { none: {} } } }, include: { variant: { include: { card: true } } } });
  const v = snap!.variant;
  await page.goto(`/cards/${v.cardId}?v=${v.id}`);
  const watch = page.getByRole("form", { name: "Watch this printing" });
  await watch.getByText("at or below").click();
  await watch.getByText("THB", { exact: true }).click();
  await watch.getByLabel("Target").fill("1.00");
  await watch.getByRole("button", { name: "Watch" }).click();
  await expect(watch.getByRole("status")).toHaveText("Watching.");

  // a manual price below the target crosses it
  await page.getByRole("button", { name: "Set manual price" }).click();
  await page.getByLabel("Your price").fill("0.50");
  await page.locator("form").filter({ has: page.getByLabel("Your price") }).getByText("THB", { exact: true }).click();
  await page.getByRole("button", { name: "Set override" }).click();
  await expect(page.getByText("Manual price set")).toBeVisible();

  await page.goto("/news");
  await expect(page.getByTestId("alert").filter({ hasText: `${v.card.name} is down to ฿0.50` })).toHaveCount(1);
  await page.goto("/watchlist");
  await expect(page.getByTestId("watchlist")).toContainText("✓ Target reached");
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test("no horizontal scroll on the new pages, and the More menu reaches every screen", async ({ page }) => {
    for (const p of ["/news", "/news?tab=rulings", "/news/new", "/meta", "/meta/import", "/watchlist"]) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), p).toBeLessThanOrEqual(0);
    }
    await page.getByRole("button", { name: "More" }).click();
    for (const label of ["Cards", "Meta", "Watchlist", "Settings"]) await expect(page.locator("#more-menu").getByRole("link", { name: label })).toBeVisible();
  });
});
