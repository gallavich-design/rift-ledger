// "I own all of these" on a deck: mass-adds the missing copies to the collection as one order.
import { expect, test } from "@playwright/test";
import { db, legalList } from "./helpers";

test.describe.configure({ mode: "serial" });
test.afterAll(() => db.$disconnect());

test("marking a deck as owned adds exactly the missing copies, as one undoable order", async ({ page }) => {
  const list = await legalList();
  await page.goto("/decks/new");
  await page.getByLabel("Deck name").fill("E2E Owned Deck");
  await page.getByLabel("Decklist", { exact: true }).fill(list.text);
  await page.getByRole("button", { name: "Import deck" }).click();
  await expect(page).toHaveURL(/\/decks\/(?!new$)[^/]+$/);
  const deckId = page.url().split("/decks/")[1];

  // One proxied copy, to check proxies are left alone unless you say otherwise.
  const proxied = await db.deckCard.findFirstOrThrow({ where: { deckId, section: "MAIN" } });
  await db.deckCard.update({ where: { id: proxied.id }, data: { proxyQuantity: 1 } });
  await page.reload();

  const owner = await db.user.findUniqueOrThrow({ where: { email: "owner@local" } });
  const cards = await db.deckCard.findMany({ where: { deckId } });
  const cardIds = [...new Set(cards.map((c) => c.cardId))];
  const ownedOf = async () => {
    const lots = await db.lot.findMany({ where: { userId: owner.id, remainingQuantity: { gt: 0 }, variant: { cardId: { in: cardIds } } }, include: { variant: true } });
    const m = new Map<string, number>();
    for (const l of lots) m.set(l.variant.cardId, (m.get(l.variant.cardId) ?? 0) + l.remainingQuantity);
    return m;
  };
  const need = new Map<string, number>();
  for (const c of cards) need.set(c.cardId, (need.get(c.cardId) ?? 0) + c.quantity - (c.id === proxied.id ? 1 : 0));
  const before = await ownedOf();
  const expected = [...need].reduce((a, [id, n]) => a + Math.max(0, n - (before.get(id) ?? 0)), 0);
  expect(expected).toBeGreaterThan(0);

  await page.getByTestId("mark-owned").click();
  const panel = page.getByTestId("mark-owned-panel");
  await expect(panel).toContainText(`Add ${expected} ${expected === 1 ? "copy" : "copies"}`);
  await expect(panel.getByRole("checkbox")).not.toBeChecked();
  await page.getByTestId("mark-owned-confirm").click();
  await expect(page.getByTestId("mark-owned-result")).toContainText(`Added ${expected} copies`);

  const order = await db.order.findFirstOrThrow({ where: { userId: owner.id, seller: "From deck: E2E Owned Deck" }, include: { lots: true } });
  expect(order.lots.reduce((a, l) => a + l.quantity, 0)).toBe(expected);
  const after = await ownedOf();
  for (const [id, n] of need) expect(after.get(id) ?? 0).toBeGreaterThanOrEqual(n);
  // The proxied copy is still a proxy, so it's still "missing" — exactly one.
  await expect(page.getByTestId("missing-copies")).toHaveText("1");

  // Including proxies adds the real copy for it and clears the proxy mark.
  await page.getByTestId("mark-owned").click();
  await page.getByTestId("mark-owned-panel").getByRole("checkbox").check();
  await page.getByTestId("mark-owned-confirm").click();
  await expect(page.getByTestId("mark-owned-result")).toBeVisible();
  expect((await db.deckCard.findUniqueOrThrow({ where: { id: proxied.id } })).proxyQuantity).toBe(0);
  await expect(page.getByTestId("missing-copies")).toHaveText("0");
  const [own, of] = (await page.getByTestId("owned-copies").textContent())!.split("/").map((x) => Number(x.trim()));
  expect(own).toBe(of);
  await expect(page.getByTestId("mark-owned")).toHaveCount(0); // nothing left to add

  // Undo = delete the order.
  await page.goto(`/collection/orders/${order.id}`);
  await expect(page.getByText("From deck: E2E Owned Deck")).toBeVisible();
});
