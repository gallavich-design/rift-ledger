// Phase 5 — Definition of Done, end to end. Runs serially on prisma/e2e.db (see npm run e2e).
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, devices, type Page } from "@playwright/test";
import { db } from "./helpers";

test.describe.configure({ mode: "serial" });
test.afterAll(() => db.$disconnect());

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Splits one CSV line, honouring quoted fields. */
const csvRow = (line: string) => [...line.matchAll(/("([^"]|"")*"|[^,]*)(,|$)/g)].map((m) => m[1].replace(/^"|"$/g, "").replace(/""/g, '"')).slice(0, -1);
const minorOf = (text: string) => Math.round(Number(text.replace(/[^\d.]/g, "")) * 100);

async function setDisplayCurrency(page: Page, c: "USD" | "THB") {
  await page.goto("/settings#money");
  await page.locator("#money").getByText(c, { exact: true }).first().click();
  await page.locator("#money").getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#money").getByRole("status")).toHaveText("Saved.");
}

/** Cards with one printing and a TCGplayer price, so the picker selects without a second step. */
async function pricedSinglePrintCards(n: number, skip = 0) {
  const snaps = await db.priceSnapshot.findMany({
    where: { source: "TCGPLAYER", market: { gt: 50 } },
    distinct: ["variantId"],
    take: 600,
    include: { variant: { include: { card: { include: { _count: { select: { variants: true } } } } } } },
  });
  const out: { variantId: string; cardId: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const s of snaps) {
    const c = s.variant.card;
    if (seen.has(c.id) || c._count.variants !== 1 || /[(),]/.test(c.name)) continue;
    seen.add(c.id);
    out.push({ variantId: s.variantId, cardId: c.id, name: c.name });
  }
  return out.slice(skip, skip + n);
}

async function addPick(page: Page, name: string) {
  const input = page.getByPlaceholder("Type a card name").first();
  await input.fill(name);
  await page.getByRole("option", { name: new RegExp(`^${esc(name)}`) }).first().click();
}

async function latestMarket(variantId: string) {
  const s = await db.priceSnapshot.findFirst({ where: { variantId, source: "TCGPLAYER" }, orderBy: { day: "desc" } });
  return s?.market ?? s?.mid ?? s?.low ?? 0;
}

let sealedId = "";

test("Opening a box creates a lot for every pull with its value-weighted share of the box cost", async ({ page }) => {
  await setDisplayCurrency(page, "THB");
  const product = await db.sealedPriceSnapshot.findFirst({ where: { market: { not: null } }, orderBy: { day: "desc" } });
  expect(product, "sealed prices are stored by the price job").toBeTruthy();

  await page.goto("/sealed/add");
  await page.locator("#tcg-product").selectOption(product!.tcgplayerId);
  await page.getByText("USD", { exact: true }).click();
  await page.getByLabel("Price each").fill("120.00");
  await expect(page.getByTestId("sealed-landed")).toHaveText("$120.00");
  await page.getByRole("button", { name: "Save sealed product" }).click();
  await page.waitForURL(/\/sealed\/[^/]+\?saved=1$/);
  sealedId = page.url().split("/sealed/")[1].split("?")[0];
  await expect(page.getByText("TCGplayer market").first()).toBeVisible(); // price shows its source + time

  await page.getByRole("link", { name: "Open one" }).click();
  await page.waitForURL(/\/open$/);
  const pulls = await pricedSinglePrintCards(3);
  for (const p of pulls) await addPick(page, p.name);
  await addPick(page, pulls[0].name); // same printing again → quantity 2
  await expect(page.getByTestId("pull-lines").locator("li")).toHaveCount(3);
  await expect(page.getByTestId("pull-lines").getByText("No price yet")).toHaveCount(0);
  await expect(page.getByTestId("pulls-value")).not.toHaveText("$0.00");
  await page.getByRole("button", { name: /Save opening · 4 cards/ }).click();
  await page.waitForURL(/\/sealed\/openings\/[^/]+\?saved=1$/);
  await expect(page.getByRole("status")).toContainText("4 cards added");

  const opening = await db.packOpening.findFirstOrThrow({ where: { sealedProductId: sealedId }, include: { lots: true } });
  expect(opening.lots).toHaveLength(3);
  expect(opening.lots.reduce((a, l) => a + l.quantity, 0)).toBe(4);
  expect(opening.costBasis).toBe(12000);
  expect(opening.lots.reduce((a, l) => a + l.landedTotal, 0)).toBe(12000); // exactly the box cost
  let value = 0;
  for (const l of opening.lots) value += (await latestMarket(l.variantId)) * l.quantity;
  expect(opening.pullsValue).toBe(value);
  for (const l of opening.lots) {
    const expected = ((await latestMarket(l.variantId)) * l.quantity * 12000) / value; // market × 120 / pulls value
    // floor shares; the few leftover cents go to the most valuable pull (same rule as Example A)
    expect(Math.abs(l.landedTotal - expected)).toBeLessThan(opening.lots.length);
    expect(l.currency).toBe("USD");
  }
  const change = value - 12000;
  await expect(page.getByTestId("opening-result")).toContainText(`${change >= 0 ? "+" : "−"}$${(Math.abs(change) / 100).toFixed(2)}`);
  expect((await db.sealedProduct.findUniqueOrThrow({ where: { id: sealedId } })).remaining).toBe(0);

  // The pulls are in the collection and show up in the set binder.
  const v = await db.cardVariant.findUniqueOrThrow({ where: { id: opening.lots[0].variantId }, include: { set: true } });
  await page.goto(`/collection/binder?set=${v.set.code}&scope=all&show=owned`);
  await expect(page.getByTestId("binder-grid").locator('li[data-owned="1"]').first()).toBeVisible();
  expect(Number(await page.getByTestId("binder-have").textContent())).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId("binder-cost")).toHaveText(/฿[\d,]+\.\d\d/);
});

test("Sealed value joins the dashboard total", async ({ page }) => {
  // Add a second, unopened box with a manual price so the sealed share is known exactly.
  const r = await page.request.get("/dashboard?source=TCGPLAYER");
  expect(r.ok()).toBeTruthy();
  await page.goto("/dashboard?source=TCGPLAYER");
  const before = minorOf((await page.getByTestId("total-value").textContent())!);
  await page.goto("/sealed/add");
  await page.getByLabel("Name").fill("DEMO-free test bundle");
  await page.getByText("THB", { exact: true }).first().click();
  await page.getByLabel("Price each").fill("1000.00");
  await page.getByRole("button", { name: "Save sealed product" }).click();
  await page.waitForURL(/\/sealed\/[^/]+\?saved=1$/);
  await page.getByLabel("Price each").fill("1500.00");
  await page.getByRole("button", { name: "Save price" }).click();
  await expect(page.getByText("Manual price saved.")).toBeVisible();
  await page.goto("/dashboard?source=TCGPLAYER");
  const after = minorOf((await page.getByTestId("total-value").textContent())!);
  expect(after - before).toBe(150000);
});

test("Trade calculator unit prices match the card pages, and totals add up", async ({ page }) => {
  const [give, get] = await pricedSinglePrintCards(2, 3);
  await page.goto("/trade");
  await page.getByTestId("trade-mine").getByPlaceholder("Type a card name").fill(give.name);
  await page.getByRole("option", { name: new RegExp(`^${esc(give.name)}`) }).first().click();
  await page.getByTestId("trade-theirs").getByPlaceholder("Type a card name").fill(get.name);
  await page.getByRole("option", { name: new RegExp(`^${esc(get.name)}`) }).first().click();
  await page.getByTestId("trade-mine").getByLabel(`Quantity of ${give.name}`).fill("3");

  const mineUnit = page.getByTestId("trade-mine").getByTestId("trade-unit");
  const theirsUnit = page.getByTestId("trade-theirs").getByTestId("trade-unit");
  await expect(mineUnit).toHaveText(/฿/);
  await expect(theirsUnit).toHaveText(/฿/);
  const mu = (await mineUnit.textContent())!;
  const tu = (await theirsUnit.textContent())!;
  await expect(page.getByTestId("trade-mine-total")).toHaveText(`฿${((minorOf(mu) * 3) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
  await expect(page.getByTestId("trade-theirs-total")).toHaveText(tu);
  await expect(page.getByTestId("trade-summary")).toContainText(/in (your|their) favour|even trade/);

  for (const [card, unit] of [
    [give, mu],
    [get, tu],
  ] as const) {
    await page.goto(`/cards/${card.cardId}`);
    await expect(page.getByTestId("src-tcgplayer")).toContainText(`≈ ${unit}`);
  }
});

test("Haves/wants share link shows a read-only list", async ({ page }) => {
  const [card] = await pricedSinglePrintCards(1, 6);
  await page.goto("/trade/lists");
  await page.getByTestId("list-HAVE").getByPlaceholder("Type a card name").fill(card.name);
  await page.getByRole("option", { name: new RegExp(`^${esc(card.name)}`) }).first().click();
  await expect(page.getByTestId("list-HAVE").getByText(card.name)).toBeVisible();
  await page.getByRole("button", { name: "Create share link" }).click();
  const url = (await page.getByTestId("trade-share-url").textContent())!;
  await page.goto(new URL(url).pathname);
  await expect(page.getByTestId("shared-haves")).toContainText(card.name);
  await expect(page.getByText("Shared trade list · read only")).toBeVisible();
});

test("Value report PDF opens and its total matches the dashboard", async ({ page }) => {
  await page.goto("/dashboard?source=TCGPLAYER");
  const dash = (await page.getByTestId("total-value").textContent())!;
  await page.goto("/reports?source=TCGPLAYER");
  await expect(page.getByTestId("report-total")).toHaveText(dash);

  const pdf = await page.request.get("/api/reports/value?format=pdf&source=TCGPLAYER");
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  const buf = await pdf.body();
  expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(Number(pdf.headers()["x-report-total"])).toBe(minorOf(dash));
  const dir = mkdtempSync(path.join(os.tmpdir(), "rl-report-"));
  writeFileSync(path.join(dir, "r.pdf"), buf);
  const text = execFileSync("pdftotext", ["-layout", path.join(dir, "r.pdf"), "-"]).toString();
  expect(text).toContain(`THB ${dash.replace("฿", "")}`); // headline total, same as the dashboard
  expect(text).toContain("Totals by set");
  expect(text).toContain("Sealed products");

  const csv = await (await page.request.get("/api/reports/value?format=csv&source=TCGPLAYER")).text();
  const total = csvRow(csv.trim().split("\r\n").at(-1)!);
  expect(total[0]).toBe("TOTAL");
  expect(Math.round(Number(total[11]) * 100)).toBe(minorOf(dash));
});

test("Export → import into a fresh database gives the same dashboard totals", async ({ page }) => {
  await page.goto("/dashboard?source=TCGPLAYER");
  const dash = (await page.getByTestId("total-value").textContent())!;
  const realized = (await page.getByTestId("realized").textContent())!;
  const res = await page.request.get("/api/data/export?format=json");
  expect(res.ok()).toBeTruthy();
  const dir = mkdtempSync(path.join(os.tmpdir(), "rl-export-"));
  const file = path.join(dir, "export.json");
  writeFileSync(file, await res.body());

  // A brand-new database: migrations only, no catalogue, no prices.
  const out = execFileSync("npx", ["tsx", "scripts/verify-roundtrip.ts", file, path.join(dir, "fresh.db"), "TCGPLAYER"], { cwd: path.resolve(__dirname, ".."), env: { ...process.env } }).toString();
  const r = JSON.parse(out.trim().split("\n").at(-1)!);
  expect(r.formatted).toBe(dash);
  expect(r.summary.rows.lot).toBeGreaterThan(0);

  // And through the UI: empty this account, import the file, and the dashboard comes back identical.
  const owner = await db.user.findUniqueOrThrow({ where: { email: "owner@local" } });
  await db.$transaction([
    db.saleAllocation.deleteMany({ where: { sale: { userId: owner.id } } }),
    db.sale.deleteMany({ where: { userId: owner.id } }),
    db.lot.deleteMany({ where: { userId: owner.id } }),
    db.packOpening.deleteMany({ where: { userId: owner.id } }),
    db.sealedProduct.deleteMany({ where: { userId: owner.id } }),
    db.order.deleteMany({ where: { userId: owner.id } }),
    db.manualPrice.deleteMany({ where: { userId: owner.id } }),
    db.localPriceReport.deleteMany({ where: { userId: owner.id } }),
    db.tradeListItem.deleteMany({ where: { userId: owner.id } }),
    db.watchItem.deleteMany({ where: { userId: owner.id } }),
    db.matchResult.deleteMany({ where: { userId: owner.id } }),
    db.deck.deleteMany({ where: { userId: owner.id } }),
    db.metaDeck.deleteMany({ where: { userId: owner.id } }),
    db.storageLocation.deleteMany({ where: { userId: owner.id } }),
  ]);
  await page.goto("/settings#data");
  await page.locator("#import-file").setInputFiles(file);
  await expect(page.getByTestId("import-result")).toContainText("Imported");
  await page.goto("/dashboard?source=TCGPLAYER");
  await expect(page.getByTestId("total-value")).toHaveText(dash);
  await expect(page.getByTestId("realized")).toHaveText(realized);
});

test.describe("PWA", () => {
  const { defaultBrowserType: _ignored, ...pixel } = devices["Pixel 7"];
  void _ignored;
  test.use(pixel);
  test("is installable on a phone", async ({ page }) => {
    const m = await (await page.request.get("/manifest.webmanifest")).json();
    expect(m.display).toBe("standalone");
    expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    for (const i of m.icons) expect((await page.request.get(i.src)).ok()).toBeTruthy();
    await page.goto("/dashboard");
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toMatch(/\/$/);
    const cdp = await page.context().newCDPSession(page);
    const { installabilityErrors } = (await cdp.send("Page.getInstallabilityErrors")) as { installabilityErrors: { errorId: string }[] };
    expect(installabilityErrors.map((e) => e.errorId)).toEqual([]);
    // Bottom nav reaches the new screens through "More".
    await page.getByRole("button", { name: "More" }).click();
    for (const name of ["Sealed", "Trade", "Reports"]) await expect(page.locator("#more-menu").getByRole("link", { name })).toBeVisible();
  });
});
