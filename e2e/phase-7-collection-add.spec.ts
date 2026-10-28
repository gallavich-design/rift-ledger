// Recording cards you already own: "Add to collection" on a card page, "Complete the set" and
// "Edit what I own" in the set binder — none of them purchases. Plus taking cards out again.
import { expect, test } from "@playwright/test";
import { db } from "./helpers";

test.describe.configure({ mode: "serial" });
test.afterAll(() => db.$disconnect());

const ownerId = async () => (await db.user.findUniqueOrThrow({ where: { email: "owner@local" } })).id;

test("Add to collection records copies you already own in the binder you pick — not a purchase — and Undo takes them back", async ({ page }) => {
  const userId = await ownerId();
  const variant = await db.cardVariant.findFirstOrThrow({ where: { set: { code: "OGN" }, art: "STANDARD", finish: "NORMAL", language: "EN", gradingCompany: null }, include: { card: true }, orderBy: { collectorNumber: "asc" } });
  const before = await db.lot.aggregate({ where: { userId, variantId: variant.id, remainingQuantity: { gt: 0 } }, _sum: { remainingQuantity: true } });

  await page.goto(`/cards/${variant.cardId}?v=${variant.id}`);
  await page.getByTestId("quick-add").click();
  const panel = page.getByTestId("quick-add-panel");
  await panel.getByRole("button", { name: "One more copy" }).click();
  await expect(panel.getByTestId("quick-add-qty")).toHaveValue("2");
  await panel.getByText("LP", { exact: true }).click();
  await panel.getByTestId("binder-select").selectOption("__new");
  await panel.getByTestId("binder-new-name").fill("E2E Quick Binder");
  await panel.getByTestId("quick-add-confirm").click();
  await expect(page.getByTestId("quick-add-result")).toContainText(`Added 2 × ${variant.card.name} to E2E Quick Binder.`);

  const lot = await db.lot.findFirstOrThrow({ where: { userId, variantId: variant.id }, orderBy: { createdAt: "desc" }, include: { storageLocation: true, order: true } });
  expect(lot).toMatchObject({ quantity: 2, remainingQuantity: 2, condition: "LP" });
  expect(lot.storageLocation?.name).toBe("E2E Quick Binder");
  expect(lot.storageLocation?.type).toBe("BINDER");
  expect(lot.order).toBeNull(); // not a purchase
  expect(lot.notes).toMatch(/^Already owned/);
  await expect(page.getByTestId("your-copies")).toContainText("Already owned · since");

  await page.getByTestId("quick-add-result").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("quick-add-result")).toContainText("Undone — removed 2 copies.");
  const after = await db.lot.aggregate({ where: { userId, variantId: variant.id, remainingQuantity: { gt: 0 } }, _sum: { remainingQuantity: true } });
  expect(after._sum.remainingQuantity ?? 0).toBe(before._sum.remainingQuantity ?? 0);
});

test("Complete the set asks for a binder and fills every missing slot of the set into it", async ({ page }) => {
  const userId = await ownerId();
  const SET = "OGS"; // Proving Grounds: small enough to fill in a test
  await page.goto(`/collection/binder?set=${SET}`);
  const total = Number((await page.getByTestId("binder-summary").textContent())!.match(/of\s+(\d+)\s+base cards/)![1]);
  const have = Number(await page.getByTestId("binder-have").textContent());
  expect(total).toBeGreaterThan(have);

  await page.getByTestId("complete-set").click();
  const panel = page.getByTestId("complete-set-panel");
  // Suggests a new binder named after the set.
  await expect(panel.getByTestId("binder-select")).toHaveValue("__new");
  await expect(panel.getByTestId("binder-new-name")).toHaveValue(SET);
  await panel.getByTestId("complete-set-confirm").click();
  await expect(page.getByTestId("complete-set-result")).toContainText(`Added ${total - have} cards — all in ${SET}.`);
  await expect(page.getByTestId("binder-pct")).toHaveText("100.0%");
  await expect(page.getByTestId("binder-have")).toHaveText(String(total));
  await expect(page.getByTestId("complete-set")).toHaveCount(0);

  const lots = await db.lot.findMany({ where: { userId, storageLocation: { name: SET }, notes: { startsWith: "Already owned" } } });
  expect(lots).toHaveLength(total - have);
  expect(lots.every((l) => l.quantity === 1 && l.orderId === null)).toBe(true);

  // Undo restores the binder.
  await page.getByTestId("complete-set-result").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("complete-set-result")).toContainText("Undone");
  await expect(page.getByTestId("binder-have")).toHaveText(String(have));
  // The binder you made is reused next time.
  await page.getByTestId("complete-set").click();
  const loc = await db.storageLocation.findFirstOrThrow({ where: { userId, name: SET } });
  await expect(page.getByTestId("complete-set-panel").getByTestId("binder-select")).toHaveValue(loc.id);
});

test("Cards can be taken out of a binder, and removed from the collection a few copies at a time", async ({ page }) => {
  const userId = await ownerId();
  const variant = await db.cardVariant.findFirstOrThrow({
    where: { set: { code: "OGN" }, art: "STANDARD", finish: "NORMAL", language: "EN", gradingCompany: null, lots: { none: {} } },
    include: { card: true },
    orderBy: { collectorNumber: "desc" },
  });
  await page.goto(`/cards/${variant.cardId}?v=${variant.id}`);
  await page.getByTestId("quick-add").click();
  const panel = page.getByTestId("quick-add-panel");
  await panel.getByRole("button", { name: "One more copy" }).click();
  await panel.getByRole("button", { name: "One more copy" }).click();
  await panel.getByTestId("binder-select").selectOption("__new");
  await panel.getByTestId("binder-new-name").fill("E2E Remove Binder");
  await panel.getByTestId("quick-add-confirm").click();
  await expect(page.getByTestId("quick-add-result")).toContainText("Added 3 ×");

  const row = page.getByTestId("your-copies").locator("li").filter({ hasText: "3×" });
  // Take them out of the binder (they stay in the collection).
  await expect(row.getByTestId("lot-binder").locator("option:checked")).toHaveText("E2E Remove Binder");
  await row.getByTestId("lot-binder").selectOption("");
  await expect(row).toContainText("Taken out of the binder");
  const lot = await db.lot.findFirstOrThrow({ where: { userId, variantId: variant.id } });
  expect(lot.storageLocationId).toBeNull();
  expect(lot.remainingQuantity).toBe(3);

  // Remove 2 of the 3.
  await row.getByTestId("lot-remove").click();
  const rm = page.getByTestId("lot-remove-panel");
  await expect(rm.getByTestId("lot-remove-qty")).toHaveText("3");
  await rm.getByRole("button", { name: "Remove one fewer" }).click();
  await rm.getByTestId("lot-remove-confirm").click();
  await expect(page.getByTestId("your-copies").locator("li").filter({ hasText: "1×" })).toBeVisible();
  const after = await db.lot.findUniqueOrThrow({ where: { id: lot.id } });
  expect(after).toMatchObject({ quantity: 1, remainingQuantity: 1 });
  expect(after.landedTotal).toBe(Math.floor(lot.landedTotal / 3));

  // Remove the last one: it's gone.
  await page.getByTestId("your-copies").getByTestId("lot-remove").click();
  await page.getByTestId("lot-remove-confirm").click();
  await expect(page.getByText("You don't own this card yet.")).toBeVisible();
  expect(await db.lot.count({ where: { id: lot.id } })).toBe(0);
});

test("Edit what I own: tap the cards you have, save once, and lower a count to remove copies", async ({ page }) => {
  const userId = await ownerId();
  await page.goto("/collection/binder?set=OGS");
  await page.getByTestId("binder-edit").click();
  await expect(page).toHaveURL(/edit=1/);
  const editor = page.getByTestId("binder-editor");
  await editor.getByTestId("binder-select").selectOption("__new");
  await editor.getByTestId("binder-new-name").fill("E2E Edit Binder");

  const slots = editor.getByTestId("edit-slot");
  const first = slots.nth(0);
  const second = slots.nth(1);
  const firstStart = Number(await first.getAttribute("data-count"));
  const secondStart = Number(await second.getAttribute("data-count"));
  // Tap the picture twice = 2 more; + once on the second card.
  await first.locator("button").first().click();
  await first.locator("button").first().click();
  await second.getByRole("button", { name: /^One more / }).click();
  await expect(first).toHaveAttribute("data-count", String(firstStart + 2));
  await expect(page.getByTestId("binder-edit-summary")).toContainText("2 cards changed · +3");
  await page.getByTestId("binder-edit-save").click();
  await expect(page.getByTestId("binder-edit-result")).toContainText("Saved — added 3 copies (new copies in E2E Edit Binder).");
  const inBinder = await db.lot.aggregate({ where: { userId, storageLocation: { name: "E2E Edit Binder" }, orderId: null }, _sum: { remainingQuantity: true } });
  expect(inBinder._sum.remainingQuantity).toBe(3);

  // Lower the first card back to where it started: those copies come out of the binder first.
  await first.getByRole("button", { name: /^One fewer / }).click();
  await first.getByRole("button", { name: /^One fewer / }).click();
  await expect(page.getByTestId("binder-edit-summary")).toContainText("1 card changed · −2");
  await page.getByTestId("binder-edit-save").click();
  await expect(page.getByTestId("binder-edit-result")).toContainText("Saved — removed 2 copies.");
  await expect(first).toHaveAttribute("data-count", String(firstStart));
  await expect(second).toHaveAttribute("data-count", String(secondStart + 1));
  const left = await db.lot.aggregate({ where: { userId, storageLocation: { name: "E2E Edit Binder" } }, _sum: { remainingQuantity: true } });
  expect(left._sum.remainingQuantity).toBe(1);

  // Done goes back to the binder view, which counts the card as owned.
  await page.getByRole("link", { name: "Done", exact: true }).click();
  await expect(page).not.toHaveURL(/edit=1/);
});
