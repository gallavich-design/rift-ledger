// "Import or buy local?" — spec §4.2.
// Import estimate = TCGplayer market × the user's average landed-cost ratio on past imported
// orders (landed total ÷ item subtotal, orders paid in USD), converted to THB.

import { convert, type FxTable } from "@/lib/money/money";

export interface ImportOrderLine {
  quantity: number;
  unitPrice: number;
  landedTotal: number;
}

/** Average landed/subtotal ratio ×1e6 across the given lines; null when there's no history. */
export function landedRatioE6(lines: ImportOrderLine[]): number | null {
  const subtotal = lines.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const landed = lines.reduce((a, l) => a + l.landedTotal, 0);
  if (!subtotal) return null;
  return Math.round((landed * 1_000_000) / subtotal);
}

export interface ImportVsLocal {
  importEstimate: number | null; // in `currency`
  local: number | null;
  ratioE6: number | null;
  cheaper: "IMPORT" | "LOCAL" | "SAME" | null;
  difference: number | null; // absolute, in `currency`
}

export function compareImportVsLocal(args: {
  tcgMarketUsd: number | null;
  ratioE6: number | null;
  localThb: number | null;
  fx: FxTable;
  currency?: string;
}): ImportVsLocal {
  const currency = args.currency ?? "THB";
  const importEstimate =
    args.tcgMarketUsd != null && args.ratioE6 != null && args.fx[currency]
      ? convert(Math.round((args.tcgMarketUsd * args.ratioE6) / 1_000_000), "USD", currency, args.fx)
      : null;
  const local = args.localThb != null && args.fx[currency] && args.fx.THB ? convert(args.localThb, "THB", currency, args.fx) : null;
  if (importEstimate == null || local == null) return { importEstimate, local, ratioE6: args.ratioE6, cheaper: null, difference: null };
  const diff = importEstimate - local;
  return {
    importEstimate,
    local,
    ratioE6: args.ratioE6,
    cheaper: diff === 0 ? "SAME" : diff < 0 ? "IMPORT" : "LOCAL",
    difference: Math.abs(diff),
  };
}
