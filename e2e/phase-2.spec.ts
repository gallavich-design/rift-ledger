// Phase 2 — Definition of Done, end to end. Runs serially on prisma/e2e.db (see npm run e2e).
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test.describe.configure({ mode: "serial" });

const E2E_DB_URL = `file:${path.resolve(__dirname, "../prisma/e2e.db")}`;
const db = new PrismaClient({ datasources: { db: { url: E2E_DB_URL } } });
test.afterAll(() => db.$disconnect());

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
const daysAgo = (n: number) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/** Distinct, TCGplayer-priced, single-printing-friendly cards to buy in tests. */
async function pricedVariants(n: number) {
  const rows = await db.priceSnapshot.findMany({
    where: { source: "TCGPLAYER", market: { gt: 100 } },
    distinct: ["variantId"],
    take: 400,
    include: { variant: { include: { card: { select: { id: true, name: true } } } } },
  });
  const seen = new Set<string>();
  const out: { variantId: string; cardId: string; name: string }[] = [];
  for (const r of rows) {
    if (seen.has(r.variant.card.id) || r.variant.card.name.includes("(")) continue;
    seen.add(r.variant.card.id);
    out.push({ variantId: r.variantId, cardId: r.variant.card.id, name: r.variant.card.name });
    if (out.length === n) break;
  }
  return out;
}

async function setDisplayCurrency(page: Page, c: "USD" | "THB") {
  await page.goto("/settings#money");
  await page.locator("#money").getByText(c, { exact: true }).first().click();
  await page.locator("#money").getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#money").getByRole("status")).toHaveText("Saved.");
}

async function pickCard(page: Page, lineIndex: number, name: string) {
  const input = page.getByPlaceholder("Type a card name").nth(0);
  await input.fill(name);
  await page.getByRole("option", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
  const printing = page.getByRole("listbox", { name: /Which printing/ });
  if (await printing.isVisible().catch(() => false)) await printing.getByRole("option").first().click();
  await expect(page.getByRole("button", { name: `Change card (${name})` })).toBeVisible();
  void lineIndex;
}

test("Example A entered as one order shows the exact landed cost on each card", async ({ page }) => {
  const [a, b, c] = await pricedVariants(3);
  await page.goto("/collection/add");
  await page.getByLabel("Bought from").fill("TCGplayer");
  await page.getByText("USD", { exact: true }).click();

  await pickCard(page, 0, a.name);
  await page.getByLabel("Price each").nth(0).fill("60");

  await page.getByRole("button", { name: "Add another card" }).click();
  await pickCard(page, 1, b.name);
  await page.getByLabel("Qty").nth(1).fill("2");
  await page.getByLabel("Price each").nth(1).fill("15");

  await page.getByRole("button", { name: "Add another card" }).click();
  await pickCard(page, 2, c.name);
  await page.getByLabel("Price each").nth(2).fill("10");

  await page.getByRole("button", { name: /Shipping, forwarding/ }).click();
  await page.getByLabel("Shipping to forwarder").fill("5");
  await page.getByLabel("Forwarding fee").fill("20");
  await page.getByLabel("Import duty / tax").fill("10");
  await page.getByRole("button", { name: /Save order · 3 cards/ }).click();

  await expect(page).toHaveURL(/\/collection\/orders\/.+\?saved=1/);
  await expect(page.getByTestId("landed-each")).toHaveText([/\$81\.00$/, /\$20\.25$/, /\$13\.50$/]);
  await expect(page.getByLabel("Order totals")).toContainText("$135.00");
});

test("3 lots of one card, sell 1 → FIFO realized P/L on the dashboard", async ({ page }) => {
  await setDisplayCurrency(page, "USD");
  const [, , , d] = await pricedVariants(4);
  for (const [day, price] of [
    [daysAgo(20), "5.00"],
    [daysAgo(15), "9.00"],
    [daysAgo(10), "12.00"],
  ]) {
    await page.goto(`/collection/add?variant=${d.variantId}`);
    await page.getByLabel("Date").fill(day);
    await page.getByLabel("Bought from").fill("Local shop");
    await page.getByText("USD", { exact: true }).click();
    await page.getByLabel("Price each").fill(price);
    await page.getByRole("button", { name: "Save purchase" }).click();
    await expect(page).toHaveURL(/saved=1/);
  }
  await page.goto(`/collection/sell?variant=${d.variantId}`);
  await page.getByText("USD", { exact: true }).click();
  await page.getByLabel("Price each").fill("10.00");
  // FIFO preview: the oldest ($5.00) copy is sold
  await expect(page.getByText(/1× bought/)).toContainText(daysAgo(20));
  await page.getByRole("button", { name: "Record sale" }).click();
  await expect(page).toHaveURL(/\/collection\/orders/);

  await page.goto("/dashboard?source=TCGPLAYER");
  await expect(page.getByTestId("realized")).toContainText("+$5.00");
});

test("running the price job twice on one day keeps one snapshot per variant per source", async () => {
  test.setTimeout(240_000);
  const run = () =>
    execFileSync("npx", ["tsx", "scripts/sync-prices.ts"], { env: { ...process.env, DATABASE_URL: E2E_DB_URL }, cwd: path.resolve(__dirname, ".."), stdio: "pipe" });
  run();
  const first = await db.priceSnapshot.count({ where: { day: today } });
  run();
  const second = await db.priceSnapshot.count({ where: { day: today } });
  expect(second).toBe(first);
  const dupes = await db.priceSnapshot.groupBy({ by: ["variantId", "source", "day"], _count: true, having: { variantId: { _count: { gt: 1 } } } });
  expect(dupes).toHaveLength(0);
});

test("two days of snapshots → two chart points and gainers/losers fill in", async ({ page }) => {
  // Fixture: simulate yesterday's price job for the cards held, with prices moved up and down.
  const held = await db.lot.findMany({ where: { remainingQuantity: { gt: 0 } }, select: { variantId: true } });
  const ids = [...new Set(held.map((h) => h.variantId))];
  const todays = await db.priceSnapshot.findMany({ where: { variantId: { in: ids }, source: "TCGPLAYER", day: today } });
  expect(todays.length).toBeGreaterThan(1);
  for (const [i, s] of todays.entries()) {
    const factor = i % 2 === 0 ? 0.8 : 1.25;
    await db.priceSnapshot.upsert({
      where: { variantId_source_day: { variantId: s.variantId, source: "TCGPLAYER", day: daysAgo(1) } },
      update: { market: Math.round(s.market! * factor) },
      create: { variantId: s.variantId, source: "TCGPLAYER", day: daysAgo(1), market: Math.round(s.market! * factor), currency: "USD" },
    });
  }
  await page.goto("/dashboard?source=TCGPLAYER");
  await page.getByText("Show as table").first().click();
  await expect(page.locator("details[open] tbody tr")).toHaveCount(2);
  await expect(page.getByTestId("Top gainers").getByRole("listitem").first()).toBeVisible();
  await expect(page.getByTestId("Top losers").getByRole("listitem").first()).toBeVisible();
});

test("switching the valuation source between TCGplayer and Local changes the totals", async ({ page }) => {
  const [, , , d] = await pricedVariants(4);
  await page.goto(`/cards/${d.cardId}?v=${d.variantId}`);
  await page.getByRole("button", { name: "Report local price" }).click();
  await page.getByLabel("Price", { exact: true }).fill("777");
  await page.getByLabel("Where").fill("Facebook group");
  await page.getByRole("button", { name: "Save local price" }).click();
  await expect(page.getByText("Local price saved.")).toBeVisible();

  await page.goto("/dashboard?source=TCGPLAYER");
  const tcg = await page.getByTestId("total-value").textContent();
  await page.getByRole("link", { name: "Local", exact: true }).click();
  await expect(page).toHaveURL(/source=LOCAL/);
  const local = await page.getByTestId("total-value").textContent();
  expect(local).not.toBe(tcg);
});

test("every price shows its source and when it was updated", async ({ page }) => {
  const [a] = await pricedVariants(1);
  await page.goto(`/cards/${a.cardId}?v=${a.variantId}`);
  await expect(page.getByTestId("src-tcgplayer")).toContainText(/TCGplayer market · \d{1,2} \w{3}, \d{2}:\d{2}/);
  await page.goto("/collection");
  for (const row of await page.getByTestId("position").all()) {
    await expect(row).toContainText(/(TCGplayer market|Local \(Thailand\)|Manual) · \d{1,2} \w{3}|Set a price/);
  }
  await page.goto("/dashboard");
  await expect(page.locator("main")).toContainText(/TCGplayer market · \d{1,2} \w{3}/);
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  for (const p of ["/dashboard", "/collection", "/collection/add", "/collection/orders", "/settings"]) {
    test(`no horizontal scroll at 375px on ${p}`, async ({ page }) => {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });
  }
});
