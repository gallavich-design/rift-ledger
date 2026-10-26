// Sealed product as portfolio positions. Value = manual price if set, else the latest TCGplayer
// market price for the product (sealed has no local/Cardmarket source yet).

import type { PrismaClient } from "@prisma/client";
import { dayKey } from "@/config/app";
import { convert, type FxTable } from "@/lib/money/money";
import { priceOn } from "@/lib/portfolio/compute";

export interface SealedQuote {
  amount: number;
  currency: string;
  source: "TCGPLAYER" | "MANUAL";
  asOf: Date;
  day: string;
}

export interface SealedRow {
  id: string;
  name: string;
  kind: string;
  tcgplayerId: string | null;
  quantity: number;
  remaining: number;
  landedUnitCost: number;
  currency: string;
  acquiredDay: string;
  openedDays: string[]; // one entry per unit opened
  manualPrice: number | null;
  manualCurrency: string | null;
  imageUrl: string | null;
}

export interface SealedPosition {
  id: string;
  name: string;
  kind: string;
  remaining: number;
  cost: number;
  value: number | null;
  pl: number | null;
  plPct: number | null;
  quote: SealedQuote | null;
  imageUrl: string | null;
}

export async function loadSealed(db: PrismaClient, userId: string): Promise<SealedRow[]> {
  const rows = await db.sealedProduct.findMany({ where: { userId }, include: { openings: { select: { openedOn: true } } }, orderBy: { acquiredOn: "asc" } });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    tcgplayerId: s.tcgplayerId,
    quantity: s.quantity,
    remaining: s.remaining,
    landedUnitCost: s.landedUnitCost,
    currency: s.currency,
    acquiredDay: dayKey(s.acquiredOn),
    openedDays: s.openings.map((o) => dayKey(o.openedOn)),
    manualPrice: s.manualPrice,
    manualCurrency: s.manualCurrency,
    imageUrl: s.imageUrl,
  }));
}

export async function loadSealedPrices(db: PrismaClient, rows: SealedRow[]) {
  const ids = [...new Set(rows.map((r) => r.tcgplayerId).filter(Boolean) as string[])];
  const snaps = ids.length ? await db.sealedPriceSnapshot.findMany({ where: { tcgplayerId: { in: ids }, source: "TCGPLAYER" }, orderBy: { day: "asc" } }) : [];
  const series = new Map<string, { day: string; amount: number; currency: string; asOf: Date }[]>();
  for (const s of snaps) {
    const a = s.market ?? s.mid ?? s.low;
    if (a == null) continue;
    series.set(s.tcgplayerId, [...(series.get(s.tcgplayerId) ?? []), { day: s.day, amount: a, currency: s.currency, asOf: s.capturedAt }]);
  }
  return series;
}

export function sealedQuote(r: SealedRow, series: Map<string, { day: string; amount: number; currency: string; asOf: Date }[]>): SealedQuote | null {
  if (r.manualPrice != null) return { amount: r.manualPrice, currency: r.manualCurrency ?? r.currency, source: "MANUAL", asOf: new Date(), day: dayKey() };
  const last = r.tcgplayerId ? series.get(r.tcgplayerId)?.at(-1) : undefined;
  return last ? { amount: last.amount, currency: last.currency, source: "TCGPLAYER", asOf: last.asOf, day: last.day } : null;
}

export function computeSealedPositions(rows: SealedRow[], series: Map<string, { day: string; amount: number; currency: string; asOf: Date }[]>, fx: FxTable, display: string): SealedPosition[] {
  return rows
    .filter((r) => r.remaining > 0)
    .map((r) => {
      const q = sealedQuote(r, series);
      const cost = convert(r.landedUnitCost * r.remaining, r.currency, display, fx);
      const value = q ? convert(q.amount, q.currency, display, fx) * r.remaining : null;
      const pl = value == null ? null : value - cost;
      return { id: r.id, name: r.name, kind: r.kind, remaining: r.remaining, cost, value, pl, plPct: pl == null || !cost ? null : (pl / cost) * 100, quote: q, imageUrl: r.imageUrl };
    });
}

/** Sealed value and cost on each day (units held that day × latest price known that day). */
export function sealedHistory(days: string[], rows: SealedRow[], series: Map<string, { day: string; amount: number; currency: string }[]>, fx: FxTable, display: string) {
  return days.map((day) => {
    let value = 0;
    let cost = 0;
    for (const r of rows) {
      if (r.acquiredDay > day) continue;
      const held = r.quantity - r.openedDays.filter((d) => d <= day).length;
      if (held <= 0) continue;
      cost += convert(r.landedUnitCost * held, r.currency, display, fx);
      const p = r.manualPrice != null ? { amount: r.manualPrice, currency: r.manualCurrency ?? r.currency } : r.tcgplayerId ? priceOn(series.get(r.tcgplayerId), day) : null;
      if (p) value += convert(p.amount, p.currency, display, fx) * held;
    }
    return { day, value, cost };
  });
}
