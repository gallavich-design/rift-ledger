import { describe, expect, it } from "vitest";
import { consumeFifo } from "@/lib/money/fifo";
import {
  breakdown,
  computeHistory,
  computeMovers,
  computePositions,
  computeTotals,
  type LotInput,
  type PriceQuote,
  type PriceSeries,
  type SaleInput,
} from "./compute";

const FX = { USD: 1_000_000, THB: 33_000_000, EUR: 900_000 };
const NM = { NM: 100, LP: 85, MP: 70, HP: 50, DMG: 30 };
const quote = (amount: number, currency = "USD", day = "2026-05-01"): PriceQuote => ({ amount, currency, source: "TCGPLAYER", asOf: new Date(day), day });

describe("Example B through the portfolio", () => {
  // Jan: 2 @ $10 landed, Mar: 1 @ $16 landed, May: sell 2 @ $20, fees $4. Market $18.
  const lots: LotInput[] = [
    { id: "jan", variantId: "D", quantity: 2, remainingQuantity: 0, landedTotal: 2000, currency: "USD", condition: "NM", acquiredDay: "2026-01-10" },
    { id: "mar", variantId: "D", quantity: 1, remainingQuantity: 1, landedTotal: 1600, currency: "USD", condition: "NM", acquiredDay: "2026-03-10" },
  ];
  const sales: SaleInput[] = [
    {
      id: "s1",
      variantId: "D",
      quantity: 2,
      unitPrice: 2000,
      fees: 400,
      currency: "USD",
      soldDay: "2026-05-10",
      allocations: [{ lotId: "jan", quantity: 2, costBasis: 2000, lotCurrency: "USD" }],
    },
  ];
  const positions = computePositions(lots, new Map([["D", quote(1800)]]), FX, "USD", NM);
  const totals = computeTotals(positions, sales, FX, "USD");

  it("shows 1 copy, cost $16, value $18", () => {
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ quantity: 1, cost: 1600, value: 1800, pl: 200 });
    expect(positions[0].plPct).toBeCloseTo(12.5);
  });

  it("realized +$16.00, unrealized +$2.00", () => {
    expect(totals.realized).toBe(1600);
    expect(totals.unrealized).toBe(200);
  });

  it("converts the whole picture to THB at 33.00", () => {
    const thb = computeTotals(computePositions(lots, new Map([["D", quote(1800)]]), FX, "THB", NM), sales, FX, "THB");
    expect(thb.value).toBe(59400);
    expect(thb.realized).toBe(52800);
  });
});

describe("DoD: 3 lots of one card at different prices, sell 1", () => {
  it("realizes P/L against the oldest lot", () => {
    const lots = [
      { id: "a", quantity: 1, remainingQuantity: 1, landedTotal: 500, acquiredOn: new Date("2026-01-01") },
      { id: "b", quantity: 1, remainingQuantity: 1, landedTotal: 900, acquiredOn: new Date("2026-02-01") },
      { id: "c", quantity: 1, remainingQuantity: 1, landedTotal: 1200, acquiredOn: new Date("2026-03-01") },
    ];
    const alloc = consumeFifo(lots, 1);
    expect(alloc).toEqual([{ lotId: "a", quantity: 1, costBasis: 500 }]);
    const sale: SaleInput = { id: "s", variantId: "X", quantity: 1, unitPrice: 1000, fees: 0, currency: "USD", soldDay: "2026-04-01", allocations: alloc.map((a) => ({ ...a, lotCurrency: "USD" })) };
    expect(computeTotals([], [sale], FX, "USD").realized).toBe(500);
  });
});

describe("valuation details", () => {
  const lot = (over: Partial<LotInput>): LotInput => ({
    id: "l",
    variantId: "V",
    quantity: 1,
    remainingQuantity: 1,
    landedTotal: 1000,
    currency: "USD",
    condition: "NM",
    acquiredDay: "2026-01-01",
    ...over,
  });

  it("applies condition multipliers to value, not cost", () => {
    const [p] = computePositions([lot({ condition: "LP" })], new Map([["V", quote(1000)]]), FX, "USD", NM);
    expect(p.value).toBe(850);
    expect(p.cost).toBe(1000);
  });

  it("leaves unpriced positions out of value and unrealized P/L but keeps their cost", () => {
    const ps = computePositions([lot({}), lot({ id: "m", variantId: "W" })], new Map([["V", quote(1500)]]), FX, "USD", NM);
    const t = computeTotals(ps, [], FX, "USD");
    expect(t).toMatchObject({ value: 1500, cost: 2000, pricedCost: 1000, unrealized: 500, unpricedPositions: 1 });
  });

  it("values a THB local price in a USD display", () => {
    const [p] = computePositions([lot({})], new Map([["V", quote(33000, "THB")]]), FX, "USD", NM);
    expect(p.value).toBe(1000);
  });
});

describe("history and movers", () => {
  const lots: LotInput[] = [
    { id: "a", variantId: "V", quantity: 2, remainingQuantity: 1, landedTotal: 2000, currency: "USD", condition: "NM", acquiredDay: "2026-10-01" },
  ];
  const sales: SaleInput[] = [
    { id: "s", variantId: "V", quantity: 1, unitPrice: 1500, fees: 0, currency: "USD", soldDay: "2026-10-03", allocations: [{ lotId: "a", quantity: 1, costBasis: 1000, lotCurrency: "USD" }] },
  ];
  const series: PriceSeries = new Map([
    [
      "V",
      [
        { day: "2026-10-01", amount: 1000, currency: "USD" },
        { day: "2026-10-02", amount: 1200, currency: "USD" },
      ],
    ],
  ]);

  it("one point per day, carrying the last known price forward and honouring sales", () => {
    const h = computeHistory(["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"], lots, sales, series, FX, "USD", NM);
    expect(h).toEqual([
      { day: "2026-10-01", value: 2000, cost: 2000 },
      { day: "2026-10-02", value: 2400, cost: 2000 },
      { day: "2026-10-03", value: 1200, cost: 1000 },
    ]);
  });

  it("two days of snapshots → two points and a mover", () => {
    const h = computeHistory(["2026-10-01", "2026-10-02"], lots, [], series, FX, "USD", NM);
    expect(h).toHaveLength(2);
    const positions = computePositions(lots, new Map([["V", quote(1200)]]), FX, "USD", NM);
    const [m] = computeMovers(positions, series, "2026-10-01", "2026-10-02", FX, "USD");
    expect(m).toMatchObject({ from: 1000, to: 1200, changeAmount: 200 });
    expect(m.changePct).toBeCloseTo(20);
  });

  it("no mover with a single price point", () => {
    const one: PriceSeries = new Map([["V", [{ day: "2026-10-02", amount: 1200, currency: "USD" }]]]);
    expect(computeMovers(computePositions(lots, new Map(), FX, "USD", NM), one, "2026-10-01", "2026-10-02", FX, "USD")).toEqual([]);
  });
});

describe("breakdown", () => {
  it("splits multi-key value evenly and keeps the total exact", () => {
    const ps = [
      { variantId: "a", quantity: 1, cost: 0, value: 1001, pl: 0, plPct: 0, unitPrice: 0, quote: null },
      { variantId: "b", quantity: 1, cost: 0, value: 500, pl: 0, plPct: 0, unitPrice: 0, quote: null },
    ];
    const keys: Record<string, string[]> = { a: ["Fury", "Order"], b: ["Fury"] };
    const r = breakdown(ps, (p) => keys[p.variantId]);
    expect(r.reduce((s, x) => s + x.value, 0)).toBe(1501);
    expect(r.find((x) => x.key === "Fury")!.value).toBe(1001);
  });
});
