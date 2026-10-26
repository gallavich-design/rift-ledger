import { describe, expect, it } from "vitest";
import { allocatePackCost, packResult, pullStats } from "./pack";
import { completeBinder } from "@/lib/collection/binder";
import { tradeTotals } from "@/lib/trade/trade";

describe("Example C — pack opening allocation", () => {
  // Box cost $120.00; pulls worth $150.00 in total, one of them worth $50.00.
  const pulls = [
    { key: "Card A", quantity: 1, unitMarket: 5000 },
    { key: "Card B", quantity: 2, unitMarket: 2000 },
    { key: "Card C", quantity: 6, unitMarket: 1000 },
  ];
  const out = allocatePackCost(12000, pulls);
  const by = Object.fromEntries(out.map((p) => [p.key, p]));

  it("each pull's cost basis is its market value × 120/150", () => {
    expect(by["Card A"].costBasis).toBe(4000); // $50.00 pull → $40.00
    expect(by["Card B"].costBasis).toBe(3200); // $40.00 → $32.00
    expect(by["Card C"].costBasis).toBe(4800); // $60.00 → $48.00
  });

  it("cost bases add up to exactly what the box cost", () => {
    expect(out.reduce((a, p) => a + p.costBasis, 0)).toBe(12000);
  });

  it("box result is +$30.00 (+25.0%)", () => {
    const value = out.reduce((a, p) => a + p.lineValue, 0);
    expect(value).toBe(15000);
    expect(packResult(12000, value)).toEqual({ change: 3000, pct: 25 });
  });

  it("when pulls are worth less than the box, the ratio is above 1 and the result is negative", () => {
    const r = allocatePackCost(12000, [{ key: "x", quantity: 1, unitMarket: 8000 }]);
    expect(r[0].costBasis).toBe(12000);
    const res = packResult(12000, 8000);
    expect(res.change).toBe(-4000);
    expect(res.pct).toBeCloseTo(-33.33, 2);
  });

  it("gives the rounding remainder to the most valuable pull", () => {
    const r = allocatePackCost(1000, [
      { key: "a", quantity: 1, unitMarket: 300 },
      { key: "b", quantity: 1, unitMarket: 300 },
      { key: "c", quantity: 1, unitMarket: 400 },
    ]);
    expect(r.map((x) => x.costBasis)).toEqual([300, 300, 400]);
    const odd = allocatePackCost(100, [
      { key: "a", quantity: 1, unitMarket: 1 },
      { key: "b", quantity: 1, unitMarket: 1 },
      { key: "c", quantity: 1, unitMarket: 2 },
    ]);
    expect(odd.reduce((a, x) => a + x.costBasis, 0)).toBe(100);
    expect(odd[2].costBasis).toBe(50);
  });

  it("splits by card count when nothing is priced yet", () => {
    const r = allocatePackCost(900, [
      { key: "a", quantity: 1, unitMarket: 0 },
      { key: "b", quantity: 2, unitMarket: 0 },
    ]);
    expect(r.map((x) => x.costBasis)).toEqual([300, 600]);
  });

  it("pull stats count rarities and special printings", () => {
    const s = pullStats([
      { quantity: 10, rarity: "Common", art: "STANDARD" },
      { quantity: 1, rarity: "Showcase", art: "OVERNUMBERED" },
      { quantity: 3, rarity: "Uncommon", art: "STANDARD" },
    ]);
    expect(s).toEqual({ cards: 14, special: 1, rarity: [{ key: "Common", count: 10 }, { key: "Uncommon", count: 3 }, { key: "Showcase", count: 1 }] });
  });
});

describe("set completion binder", () => {
  it("counts owned slots, % complete and cost to complete", () => {
    const slot = (n: number, cheapest: number | null) => ({ number: n, cardId: `c${n}`, name: `Card ${n}`, rarity: null, imageUrl: null, variantIds: [`v${n}`, `v${n}f`], cheapest });
    const b = completeBinder([slot(3, 100), slot(1, 50), slot(2, null)], new Map([["v1f", 1]]));
    expect(b.slots.map((s) => [s.number, s.owned])).toEqual([[1, 1], [2, 0], [3, 0]]);
    expect(b).toMatchObject({ have: 1, total: 3, costToComplete: 100, unpricedMissing: 1 });
    expect(b.pct).toBeCloseTo(33.33, 1);
  });
});

describe("trade calculator", () => {
  it("totals each side with condition, and the difference", () => {
    const t = tradeTotals(
      [{ key: "a", quantity: 2, unit: 1000, conditionPct: 100 }],
      [
        { key: "b", quantity: 1, unit: 3000, conditionPct: 85 },
        { key: "c", quantity: 1, unit: null, conditionPct: 100 },
      ],
    );
    expect(t).toEqual({ give: 2000, get: 2550, difference: 550, unpriced: 1, fair: false });
  });
});
