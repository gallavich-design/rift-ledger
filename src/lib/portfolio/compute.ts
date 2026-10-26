// Pure portfolio maths. Inputs are plain data (already loaded); outputs are in the display currency.
// Nothing here touches the database, so every number on the dashboard is unit-testable.

import { costOfFirst, remainingCost } from "@/lib/money/fifo";
import { convert, type FxTable } from "@/lib/money/money";

export interface PriceQuote {
  amount: number; // minor units, source currency
  currency: string;
  source: string; // TCGPLAYER | LOCAL | CARDMARKET | MANUAL | DEMO
  asOf: Date; // when this price was captured / seen
  day: string;
  detail?: string; // e.g. "Facebook group" for local reports
}

export interface LotInput {
  id: string;
  variantId: string;
  quantity: number;
  remainingQuantity: number;
  landedTotal: number;
  currency: string;
  condition: string;
  acquiredDay: string; // YYYY-MM-DD
}

export interface SaleInput {
  id: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  fees: number;
  currency: string;
  soldDay: string;
  allocations: { lotId: string; quantity: number; costBasis: number; lotCurrency: string }[];
}

export interface Position {
  variantId: string;
  quantity: number;
  cost: number;
  value: number | null;
  pl: number | null;
  plPct: number | null;
  unitPrice: number | null; // display currency, NM
  quote: PriceQuote | null;
}

export interface PortfolioTotals {
  value: number; // priced positions only
  cost: number; // every open position
  pricedCost: number;
  unrealized: number;
  unrealizedPct: number | null;
  realized: number;
  unpricedPositions: number;
  positions: number;
  copies: number;
}

/** Percent of NM value a card in this condition is worth, from Settings.conditionMultipliers. */
export function conditionFactor(condition: string, multipliers: Record<string, number>): number {
  return (multipliers[condition] ?? 100) / 100;
}

export function computePositions(
  lots: LotInput[],
  prices: Map<string, PriceQuote>,
  fx: FxTable,
  display: string,
  multipliers: Record<string, number>,
): Position[] {
  const byVariant = new Map<string, LotInput[]>();
  for (const l of lots) {
    if (l.remainingQuantity <= 0) continue;
    byVariant.set(l.variantId, [...(byVariant.get(l.variantId) ?? []), l]);
  }
  const out: Position[] = [];
  for (const [variantId, vl] of byVariant) {
    const quote = prices.get(variantId) ?? null;
    const unit = quote ? convert(quote.amount, quote.currency, display, fx) : null;
    let quantity = 0;
    let cost = 0;
    let value = unit == null ? null : 0;
    for (const l of vl) {
      quantity += l.remainingQuantity;
      cost += convert(remainingCost(l), l.currency, display, fx);
      if (value != null && unit != null) value += Math.round(unit * l.remainingQuantity * conditionFactor(l.condition, multipliers));
    }
    const pl = value == null ? null : value - cost;
    out.push({ variantId, quantity, cost, value, pl, plPct: pl == null || !cost ? null : (pl / cost) * 100, unitPrice: unit, quote });
  }
  return out;
}

export function realizedFor(sale: SaleInput, fx: FxTable, display: string): number {
  const proceeds = convert(sale.quantity * sale.unitPrice - sale.fees, sale.currency, display, fx);
  const cost = sale.allocations.reduce((a, x) => a + convert(x.costBasis, x.lotCurrency, display, fx), 0);
  return proceeds - cost;
}

export function computeTotals(positions: Position[], sales: SaleInput[], fx: FxTable, display: string): PortfolioTotals {
  const priced = positions.filter((p) => p.value != null);
  const value = priced.reduce((a, p) => a + p.value!, 0);
  const pricedCost = priced.reduce((a, p) => a + p.cost, 0);
  const unrealized = value - pricedCost;
  return {
    value,
    cost: positions.reduce((a, p) => a + p.cost, 0),
    pricedCost,
    unrealized,
    unrealizedPct: pricedCost ? (unrealized / pricedCost) * 100 : null,
    realized: sales.reduce((a, s) => a + realizedFor(s, fx, display), 0),
    unpricedPositions: positions.length - priced.length,
    positions: positions.length,
    copies: positions.reduce((a, p) => a + p.quantity, 0),
  };
}

// ───────────────────────────── history ─────────────────────────────

export type PriceSeries = Map<string, { day: string; amount: number; currency: string }[]>; // sorted by day asc

/** Latest price on or before `day` (series sorted ascending). */
export function priceOn(series: { day: string; amount: number; currency: string }[] | undefined, day: string) {
  if (!series?.length) return null;
  let lo = 0;
  let hi = series.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].day <= day) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found < 0 ? null : series[found];
}

export interface HistoryPoint {
  day: string;
  value: number;
  cost: number;
}

/**
 * Portfolio value and cost basis on each given day: copies held that day × the latest price known
 * that day. Days before the first acquisition are skipped — you can't have value before you own cards.
 */
export function computeHistory(
  days: string[],
  lots: LotInput[],
  sales: SaleInput[],
  series: PriceSeries,
  fx: FxTable,
  display: string,
  multipliers: Record<string, number>,
): HistoryPoint[] {
  if (!lots.length) return [];
  const firstDay = lots.reduce((m, l) => (l.acquiredDay < m ? l.acquiredDay : m), lots[0].acquiredDay);
  const soldByLot = new Map<string, { day: string; qty: number }[]>();
  for (const s of sales) for (const a of s.allocations) soldByLot.set(a.lotId, [...(soldByLot.get(a.lotId) ?? []), { day: s.soldDay, qty: a.quantity }]);

  const out: HistoryPoint[] = [];
  for (const day of [...new Set(days)].sort()) {
    if (day < firstDay) continue;
    let value = 0;
    let cost = 0;
    for (const l of lots) {
      if (l.acquiredDay > day) continue;
      const sold = (soldByLot.get(l.id) ?? []).filter((x) => x.day <= day).reduce((a, x) => a + x.qty, 0);
      const held = l.quantity - sold;
      if (held <= 0) continue;
      cost += convert(l.landedTotal - costOfFirst(l, sold), l.currency, display, fx);
      const p = priceOn(series.get(l.variantId), day);
      if (p) value += Math.round(convert(p.amount, p.currency, display, fx) * held * conditionFactor(l.condition, multipliers));
    }
    out.push({ day, value, cost });
  }
  return out;
}

export interface Mover {
  variantId: string;
  quantity: number;
  from: number; // unit price at start, display currency
  to: number;
  changePct: number;
  changeAmount: number; // (to − from) × copies held
}

/** Price movement of currently held cards between two days. Needs a price on both sides. */
export function computeMovers(positions: Position[], series: PriceSeries, fromDay: string, toDay: string, fx: FxTable, display: string): Mover[] {
  const out: Mover[] = [];
  for (const p of positions) {
    const s = series.get(p.variantId);
    const a = priceOn(s, fromDay);
    const b = priceOn(s, toDay);
    if (!a || !b || a.day === b.day) continue;
    const from = convert(a.amount, a.currency, display, fx);
    const to = convert(b.amount, b.currency, display, fx);
    if (!from) continue;
    out.push({ variantId: p.variantId, quantity: p.quantity, from, to, changePct: ((to - from) / from) * 100, changeAmount: (to - from) * p.quantity });
  }
  return out;
}

export function breakdown<T>(positions: Position[], keyOf: (p: Position) => T[] | T): { key: T; value: number }[] {
  const m = new Map<T, number>();
  for (const p of positions) {
    if (p.value == null) continue;
    const k = keyOf(p);
    const keys = Array.isArray(k) ? k : [k];
    if (!keys.length) continue;
    // a multi-domain card's value is split evenly across its domains so the bars add up to the total
    const share = Math.floor(p.value / keys.length);
    keys.forEach((key, i) => m.set(key, (m.get(key) ?? 0) + share + (i === 0 ? p.value! - share * keys.length : 0)));
  }
  return [...m.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
}
