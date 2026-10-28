// "Add to collection" on a card page and "Complete the set" in the set binder.
import { expect, test } from "@playwright/test";
import { db } from "./helpers";

test.describe.configure({ mode: "serial" });
test.afterAll(() => db.$disconnect());

const ownerId = async () => (await db.user.findUniqueOrThrow({ where: { email: "owner@local" } })).id;

test("Add to collection adds the printing you're viewing to the binder you pick, as an undoable order", async ({ page }) => {
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
  expect(lot.order?.seller).toBe(`Added: ${variant.card.name}`);

  // Undo: delete the order from "View or undo".
  await page.getByTestId("quick-add-result").getByRole("link", { name: "View or undo" }).click();
  await page.getByRole("button", { name: "Delete order" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/collection\/orders$/);
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

  const order = await db.order.findFirstOrThrow({ where: { userId, seller: { startsWith: "Complete the set:" } }, include: { lots: { include: { storageLocation: true } } }, orderBy: { createdAt: "desc" } });
  expect(order.lots).toHaveLength(total - have);
  expect(order.lots.every((l) => l.quantity === 1 && l.storageLocation?.name === SET)).toBe(true);

  // Undo restores the binder.
  await page.getByTestId("complete-set-result").getByRole("link", { name: "View or undo" }).click();
  await page.getByRole("button", { name: "Delete order" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/collection\/orders$/);
  await page.goto(`/collection/binder?set=${SET}`);
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

  // Remove the last one: the lot and its now-empty order are gone.
  await page.getByTestId("your-copies").getByTestId("lot-remove").click();
  await page.getByTestId("lot-remove-confirm").click();
  await expect(page.getByText("You don't own this card yet.")).toBeVisible();
  expect(await db.lot.count({ where: { id: lot.id } })).toBe(0);
  expect(await db.order.count({ where: { id: lot.orderId! } })).toBe(0);
});
