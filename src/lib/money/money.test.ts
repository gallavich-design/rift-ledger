// Worked examples from the spec (§5), implemented exactly.
import { describe, expect, it } from "vitest";
import { allocateLandedCost } from "./landedCost";
import { consumeFifo, realizedPL, remainingCost, type FifoLot } from "./fifo";
import { convert, formatMoney, formatPct, parseMoneyInput, pct } from "./money";

describe("Example A — landed cost allocation", () => {
  const lines = [
    { key: "Card A", quantity: 1, unitPrice: 6000 },
    { key: "Card B", quantity: 2, unitPrice: 1500 },
    { key: "Card C", quantity: 1, unitPrice: 1000 },
  ];
  const extras = 500 + 2000 + 1000; // shipping + forwarding + duty = $35.00
  const out = allocateLandedCost(lines, extras);
  const by = Object.fromEntries(out.map((l) => [l.key, l]));

  it("allocates in proportion to subtotal share", () => {
    expect(by["Card A"].allocatedExtras).toBe(2100);
    expect(by["Card A"].landedTotal).toBe(8100);
    expect(by["Card B"].allocatedExtras).toBe(1050);
    expect(by["Card B"].landedTotal).toBe(4050);
    expect(by["Card B"].landedUnitCost).toBe(2025);
    expect(by["Card C"].landedTotal).toBe(1350);
  });

  it("totals exactly subtotal + extras", () => {
    expect(out.reduce((a, l) => a + l.landedTotal, 0)).toBe(13500);
  });

  it("gives any rounding remainder to the most expensive item", () => {
    const r = allocateLandedCost(
      [
        { key: "cheap", quantity: 1, unitPrice: 100 },
        { key: "dear", quantity: 1, unitPrice: 200 },
        { key: "mid", quantity: 1, unitPrice: 150 },
      ],
      100,
    );
    // floors: 22 + 44 + 33 = 99 → 1 left over, goes to "dear"
    expect(r.map((x) => x.allocatedExtras)).toEqual([22, 45, 33]);
    expect(r.reduce((a, l) => a + l.landedTotal, 0)).toBe(550);
  });

  it("handles an order of free items by weighting on quantity", () => {
    const r = allocateLandedCost(
      [
        { key: "x", quantity: 1, unitPrice: 0 },
        { key: "y", quantity: 3, unitPrice: 0 },
      ],
      400,
    );
    expect(r.map((x) => x.landedTotal)).toEqual([100, 300]);
  });

  it("rejects bad input", () => {
    expect(() => allocateLandedCost([{ key: "x", quantity: 0, unitPrice: 1 }], 0)).toThrow();
    expect(() => allocateLandedCost([{ key: "x", quantity: 1, unitPrice: 1.5 }], 0)).toThrow();
  });
});

describe("Example B — FIFO sale and P/L", () => {
  const lots: FifoLot[] = [
    { id: "mar", quantity: 1, remainingQuantity: 1, landedTotal: 1600, acquiredOn: new Date("2026-03-01") },
    { id: "jan", quantity: 2, remainingQuantity: 2, landedTotal: 2000, acquiredOn: new Date("2026-01-01") },
  ];

  it("consumes the January copies first and realizes +$16.00", () => {
    const alloc = consumeFifo(lots, 2);
    expect(alloc).toEqual([{ lotId: "jan", quantity: 2, costBasis: 2000 }]);
    const r = realizedPL({ quantity: 2, unitPrice: 2000, fees: 400 }, alloc);
    expect(r.proceeds).toBe(3600);
    expect(r.pl).toBe(1600);
  });

  it("leaves 1 copy costing $16.00 → unrealized +$2.00 (+12.5%) at $18.00", () => {
    const remaining = lots.find((l) => l.id === "mar")!;
    const cost = remainingCost(remaining);
    expect(cost).toBe(1600);
    const value = 1800 * remaining.remainingQuantity;
    expect(value - cost).toBe(200);
    expect(formatPct(pct(value - cost, cost))).toBe("+12.5%");
  });

  it("spans lots and keeps cost exact across partial sales", () => {
    const odd: FifoLot[] = [{ id: "a", quantity: 3, remainingQuantity: 3, landedTotal: 1000, acquiredOn: new Date("2026-01-01") }];
    const first = consumeFifo(odd, 1)[0];
    odd[0].remainingQuantity = 2;
    const second = consumeFifo(odd, 2)[0];
    expect(first.costBasis + second.costBasis).toBe(1000);
  });

  it("refuses to sell more than you hold", () => {
    expect(() => consumeFifo(lots, 4)).toThrow(/Only 3/);
  });
});

describe("Example E — display currency", () => {
  it("shows Example A's $135.00 as ฿4,455.00 at 33.00", () => {
    const fx = { USD: 1_000_000, THB: 33_000_000 };
    const thb = convert(13500, "USD", "THB", fx);
    expect(thb).toBe(445500);
    expect(formatMoney(thb, "THB")).toBe("฿4,455.00");
  });

  it("converts across non-USD pairs; a round trip drifts by at most half a euro cent", () => {
    const fx = { USD: 1_000_000, THB: 33_745_000, EUR: 893_420 };
    const eur = convert(10000, "THB", "EUR", fx);
    expect(eur).toBe(265); // ฿100.00 ≈ €2.65
    const halfCentInSatang = Math.ceil(fx.THB / fx.EUR / 2);
    expect(Math.abs(convert(eur, "EUR", "THB", fx) - 10000)).toBeLessThanOrEqual(halfCentInSatang);
  });

  it("formats signs and negatives", () => {
    expect(formatMoney(-1234, "USD")).toBe("−$12.34");
    expect(formatMoney(1600, "USD", { sign: true })).toBe("+$16.00");
  });
});

describe("parseMoneyInput", () => {
  it.each([
    ["60", 6000],
    ["15.5", 1550],
    ["1,234.56", 123456],
    ["฿99", 9900],
    ["0.07", 7],
  ])("%s → %d", (s, v) => expect(parseMoneyInput(s)).toBe(v));
  it.each(["", "abc", "1.234", "."])("rejects %s", (s) => expect(parseMoneyInput(s)).toBeNull());
});
