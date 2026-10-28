// Sign-in gate and bulk import. Runs on prisma/e2e.db like the other specs.
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { db, E2E_DB_URL } from "./helpers";

test.describe.configure({ mode: "serial" });
test.afterAll(() => db.$disconnect());

const ROOT = path.resolve(__dirname, "..");

/** Stops `npx next start` and the next-server it spawned (the whole process group). */
function stop(child: ChildProcess) {
  try {
    process.kill(-child.pid!, "SIGTERM");
  } catch {
    child.kill();
  }
}

async function startServer(port: number, env: Record<string, string>): Promise<ChildProcess> {
  const busy = await fetch(`http://localhost:${port}/manifest.webmanifest`).then(() => true, () => false);
  if (busy) throw new Error(`port ${port} is already in use — stop the old server first`);
  const child = spawn("npx", ["next", "start", "-p", String(port)], { cwd: ROOT, env: { ...process.env, DATABASE_URL: E2E_DB_URL, APP_PASSWORD: "", RIFT_LEDGER_OPEN: "", ...env }, stdio: "ignore", detached: true });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`http://localhost:${port}/manifest.webmanifest`);
      return child;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  stop(child);
  throw new Error(`server on ${port} didn't start`);
}

test("Bulk import: CSV and pasted lists are matched, previewed, and saved as orders", async ({ page }) => {
  const owner = await db.user.upsert({ where: { email: "owner@local" }, update: {}, create: { email: "owner@local", name: "Owner", settings: { create: {} } } });
  const before = await db.lot.count({ where: { userId: owner.id } });
  // A foil printing that is the only EN printing at its set + number + finish.
  const candidates = await db.priceSnapshot.findMany({
    where: { source: "TCGPLAYER", market: { gt: 100 }, variant: { finish: "FOIL", art: "STANDARD", language: "EN", gradingCompany: null, collectorNumber: { not: null } } },
    include: { variant: { include: { set: true, card: true } } },
    distinct: ["variantId"],
    take: 50,
  });
  let v = candidates[0].variant;
  for (const c of candidates) {
    const same = await db.cardVariant.count({ where: { setId: c.variant.setId, collectorNumber: c.variant.collectorNumber, finish: "FOIL", language: "EN", gradingCompany: null } });
    if (same === 1) {
      v = c.variant;
      break;
    }
  }
  const csv = [
    "set,number,name,finish,condition,quantity,currency,unit_price,acquired_on,seller,storage",
    `${v.set.code},${v.collectorNumber},,Foil,LP,2,USD,4.50,2026-10-01,CSV shop,Import box`,
    `ZZZ,999,Nonexistent,,NM,1,USD,1.00,2026-10-01,CSV shop,`,
  ].join("\n");

  await page.goto("/collection/import");
  await page.getByTestId("import-file").setInputFiles({ name: "cards.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  const table = page.getByTestId("import-preview");
  await expect(table.locator('tr[data-status="exact"]')).toHaveCount(1);
  await expect(table.locator('tr[data-status="missing"]')).toHaveCount(1);
  await expect(page.getByTestId("import-summary")).toContainText("1 of 2 rows ready");
  await expect(page.getByTestId("import-summary")).toContainText("$9.00");
  await page.getByRole("button", { name: "Import 1 row" }).click();
  await expect(page.getByTestId("import-message")).toContainText("Imported 2 cards in 1 lines (1 order); 1 rows skipped");

  const lot = await db.lot.findFirstOrThrow({ where: { userId: owner.id, variantId: v.id, condition: "LP" }, include: { order: true, storageLocation: true } });
  expect(lot).toMatchObject({ quantity: 2, unitPrice: 450, landedTotal: 900, currency: "USD" });
  expect(lot.order?.seller).toBe("CSV shop");
  expect(lot.storageLocation?.name).toBe("Import box");

  // A pasted list with a typo; no prices → market price as cost.
  const card = await db.card.findFirstOrThrow({ where: { name: { contains: " - " }, variants: { some: { priceSnapshots: { some: { source: "TCGPLAYER", market: { gt: 0 } } } } } }, orderBy: { name: "asc" } });
  const typo = card.name.slice(0, -1) + (card.name.endsWith("x") ? "y" : "x");
  await page.getByLabel("Paste a list or CSV").fill(`3 ${typo}\n1 Definitely Not A Riftbound Card Qwzx`);
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(table.locator("tr")).toHaveCount(3);
  await expect(table.locator('tr[data-status="fuzzy"], tr[data-status="chosen"], tr[data-status="exact"]')).toHaveCount(1);
  await expect(table).toContainText(card.name);
  await expect(table).toContainText("market");
  await page.getByRole("button", { name: /Import 1 row/ }).click();
  await expect(page.getByTestId("import-message")).toContainText("Imported 3 cards");
  expect(await db.lot.count({ where: { userId: owner.id } })).toBe(before + 2);
});

test("Sign-in gate: password required, share links stay public, no password → refuses to serve", async ({ browser }) => {
  const owner = await db.user.findUniqueOrThrow({ where: { email: "owner@local" } });
  await db.settings.update({ where: { userId: owner.id }, data: { tradeShareToken: "e2e-share-token" } });

  const locked = await startServer(3101, { APP_PASSWORD: "correct horse", AUTH_SECRET: "e2e-secret" });
  const open = await startServer(3102, {});
  try {
    const page = await (await browser.newContext({ baseURL: "http://localhost:3101" })).newPage();
    await page.goto("/decks?x=1");
    await expect(page).toHaveURL(/\/login\?next=%2Fdecks%3Fx%3D1$/);
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0); // no app chrome before sign-in

    expect((await page.request.get("/api/data/export?format=json")).status()).toBe(401);
    expect((await page.request.get("/api/reports/value?format=csv")).status()).toBe(401);
    const share = await page.request.get("/share/trade/e2e-share-token");
    expect(share.status()).toBe(200);
    expect(await share.text()).toContain("Haves &amp; wants");
    expect((await page.request.get("/manifest.webmanifest")).ok()).toBeTruthy();

    await page.getByLabel("Password").fill("wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("That password isn't right.")).toBeVisible();
    await page.getByLabel("Password").fill("correct horse");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/decks\?x=1$/);
    expect((await page.request.get("/api/data/export?format=lots")).ok()).toBeTruthy();
    const cookie = (await page.context().cookies()).find((c) => c.name === "rl_session")!;
    expect(cookie.httpOnly).toBe(true);

    await page.goto("/settings#account");
    await page.getByRole("button", { name: "Sign out on this device" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);

    // Production server with no password and no explicit opt-out: refuses, except public paths.
    const r = await fetch("http://localhost:3102/dashboard");
    expect(r.status).toBe(503);
    expect(await r.text()).toContain("Set APP_PASSWORD");
    expect((await fetch("http://localhost:3102/share/trade/e2e-share-token")).status).toBe(200);
  } finally {
    stop(locked);
    stop(open);
    await db.settings.update({ where: { userId: owner.id }, data: { tradeShareToken: null } }); // leave sharing off for later specs
  }
});
