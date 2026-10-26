import { describe, expect, it } from "vitest";
import type { CardPricing } from "@/lib/decks/cost";
import { sortMeta, summarizeMeta } from "./summary";

const price = (cardId: string, unit: number): [string, CardPricing] => [cardId, { cardId, defaultVariantId: cardId, variants: [{ variantId: cardId, label: cardId, unit }] }];

describe("meta deck summary", () => {
  const lines = [
    { cardId: "A", section: "MAIN" as const, quantity: 3, proxyQuantity: 0 },
    { cardId: "B", section: "MAIN" as const, quantity: 1, proxyQuantity: 0 },
  ];
  const pricing = new Map([price("A", 1000), price("B", 5000)]);

  it("% owned, missing copies and cost to complete", () => {
    const s = summarizeMeta(lines, new Map([["A", 2]]), pricing);
    expect(s).toMatchObject({ pctOwned: 50, missing: 2, cost: 6000, budget: 6000, copies: 4 });
  });

  it("sorts by cheapest to complete, and by % owned", () => {
    const rows = [
      { id: "x", summary: { pctOwned: 90, missing: 1, cost: 9000, budget: 9000, copies: 10, unpriced: 0 }, playedOn: "2026-10-01", createdAt: "" },
      { id: "y", summary: { pctOwned: 10, missing: 9, cost: 100, budget: 100, copies: 10, unpriced: 0 }, playedOn: "2026-10-20", createdAt: "" },
      { id: "z", summary: { pctOwned: 50, missing: 5, cost: 500, budget: 400, copies: 10, unpriced: 0 }, playedOn: null, createdAt: "2026-10-25" },
    ];
    expect(sortMeta(rows, "cheapest").map((r) => r.id)).toEqual(["y", "z", "x"]);
    expect(sortMeta(rows, "owned").map((r) => r.id)).toEqual(["x", "z", "y"]);
    expect(sortMeta(rows, "newest").map((r) => r.id)).toEqual(["z", "y", "x"]);
  });
});
