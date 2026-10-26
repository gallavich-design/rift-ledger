import { describe, expect, it } from "vitest";
import { compareImportVsLocal, landedRatioE6 } from "./importVsLocal";

const FX = { USD: 1_000_000, THB: 33_000_000 };

describe("import or buy local", () => {
  it("uses Example A's order as the landed ratio (135/100 = 1.35)", () => {
    const ratio = landedRatioE6([
      { quantity: 1, unitPrice: 6000, landedTotal: 8100 },
      { quantity: 2, unitPrice: 1500, landedTotal: 4050 },
      { quantity: 1, unitPrice: 1000, landedTotal: 1350 },
    ]);
    expect(ratio).toBe(1_350_000);
  });

  it("says local is cheaper when it is, and by how much", () => {
    // $10.00 × 1.35 = $13.50 → ฿445.50; local ฿400.00 → local cheaper by ฿45.50
    const r = compareImportVsLocal({ tcgMarketUsd: 1000, ratioE6: 1_350_000, localThb: 40000, fx: FX });
    expect(r).toMatchObject({ importEstimate: 44550, local: 40000, cheaper: "LOCAL", difference: 4550 });
  });

  it("says import is cheaper when it is", () => {
    const r = compareImportVsLocal({ tcgMarketUsd: 1000, ratioE6: 1_350_000, localThb: 50000, fx: FX });
    expect(r).toMatchObject({ cheaper: "IMPORT", difference: 5450 });
  });

  it("can't compare without import history or a local price", () => {
    expect(compareImportVsLocal({ tcgMarketUsd: 1000, ratioE6: null, localThb: 40000, fx: FX }).cheaper).toBeNull();
    expect(compareImportVsLocal({ tcgMarketUsd: 1000, ratioE6: 1_350_000, localThb: null, fx: FX }).cheaper).toBeNull();
    expect(landedRatioE6([])).toBeNull();
  });
});
