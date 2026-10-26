// Loads everything the pure portfolio functions need, for one user.

import type { PrismaClient } from "@prisma/client";
import { dayKey } from "@/config/app";
import type { FxTable } from "@/lib/money/money";
import { pipeSplit } from "@/lib/catalog/grouping";
import { computePositions, computeTotals, type LotInput, type PriceQuote, type PriceSeries, type SaleInput } from "./compute";

export { SOURCE_LABEL } from "@/lib/domain/enums";

export interface UserSettings {
  displayCurrency: string;
  defaultValuationSource: string;
  fxOverrides: Record<string, number>; // quote → rateE6 per USD
  conditionMultipliers: Record<string, number>;
}

function parseJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export async function getSettings(db: PrismaClient, userId: string): Promise<UserSettings> {
  const s = await db.settings.upsert({ where: { userId }, update: {}, create: { userId } });
  return {
    displayCurrency: s.displayCurrency,
    defaultValuationSource: s.defaultValuationSource,
    fxOverrides: parseJson(s.fxOverrides, {}),
    conditionMultipliers: parseJson(s.conditionMultipliers, { NM: 100, LP: 85, MP: 70, HP: 50, DMG: 30 }),
  };
}

export interface FxInfo {
  table: FxTable;
  rates: { quote: string; rateE6: number; day: string | null; source: string; overridden: boolean }[];
  missing: string[];
}

export async function getFx(db: PrismaClient, overrides: Record<string, number>, quotes = ["THB", "EUR"]): Promise<FxInfo> {
  const table: FxTable = { USD: 1_000_000 };
  const rates: FxInfo["rates"] = [];
  const missing: string[] = [];
  for (const q of quotes) {
    if (overrides[q]) {
      table[q] = overrides[q];
      rates.push({ quote: q, rateE6: overrides[q], day: null, source: "Manual override (Settings)", overridden: true });
      continue;
    }
    const r = await db.fxRate.findFirst({ where: { base: "USD", quote: q }, orderBy: { day: "desc" } });
    if (r) {
      table[q] = r.rateE6;
      rates.push({ quote: q, rateE6: r.rateE6, day: r.day, source: r.source, overridden: false });
    } else missing.push(q);
  }
  return { table, rates, missing };
}

/** Current price per variant for a source. A manual override always wins. */
export async function getPriceBook(
  db: PrismaClient,
  userId: string,
  variantIds: string[],
  source: string,
  asOfDay: string = dayKey(),
): Promise<Map<string, PriceQuote>> {
  const book = new Map<string, PriceQuote>();
  if (!variantIds.length) return book;

  if (source === "LOCAL") {
    const reports = await db.localPriceReport.findMany({
      where: { userId, variantId: { in: variantIds } },
      orderBy: [{ seenOn: "desc" }, { createdAt: "desc" }],
    });
    for (const r of reports) {
      const day = dayKey(r.seenOn);
      if (day > asOfDay || book.has(r.variantId)) continue;
      book.set(r.variantId, { amount: r.price, currency: r.currency, source: "LOCAL", asOf: r.seenOn, day, detail: r.whereSeen });
    }
  } else {
    const snaps = await db.priceSnapshot.findMany({
      where: { variantId: { in: variantIds }, source, day: { lte: asOfDay } },
      orderBy: { day: "desc" },
    });
    for (const s of snaps) {
      if (book.has(s.variantId)) continue;
      const amount = s.market ?? s.mid ?? s.low;
      if (amount == null) continue;
      book.set(s.variantId, {
        amount,
        currency: s.currency,
        source,
        asOf: s.capturedAt,
        day: s.day,
        detail: s.market == null ? (s.mid != null ? "mid (no market price)" : "low (no market price)") : undefined,
      });
    }
  }

  const manual = await db.manualPrice.findMany({ where: { userId, variantId: { in: variantIds } } });
  for (const m of manual) {
    book.set(m.variantId, { amount: m.price, currency: m.currency, source: "MANUAL", asOf: m.updatedAt, day: dayKey(m.updatedAt), detail: m.note ?? undefined });
  }
  return book;
}

/** Day-by-day price history per variant for one source (manual overrides replace the series). */
export async function getPriceSeries(
  db: PrismaClient,
  userId: string,
  variantIds: string[],
  source: string,
  fromDay?: string,
): Promise<PriceSeries> {
  const series: PriceSeries = new Map();
  if (!variantIds.length) return series;
  const push = (id: string, day: string, amount: number, currency: string) => {
    const list = series.get(id) ?? [];
    const last = list[list.length - 1];
    if (last?.day === day) last.amount = amount;
    else list.push({ day, amount, currency });
    series.set(id, list);
  };

  const manualIds = new Set(
    (await db.manualPrice.findMany({ where: { userId, variantId: { in: variantIds } }, select: { variantId: true } })).map((m) => m.variantId),
  );
  const others = variantIds.filter((id) => !manualIds.has(id));

  if (source === "LOCAL") {
    const reports = await db.localPriceReport.findMany({
      where: { userId, variantId: { in: others } },
      orderBy: [{ seenOn: "asc" }, { createdAt: "asc" }],
    });
    for (const r of reports) {
      const day = dayKey(r.seenOn);
      if (!fromDay || day >= fromDay) push(r.variantId, day, r.price, r.currency);
    }
  } else if (others.length) {
    const snaps = await db.priceSnapshot.findMany({
      where: { variantId: { in: others }, source, ...(fromDay ? { day: { gte: fromDay } } : {}) },
      orderBy: { day: "asc" },
    });
    for (const s of snaps) {
      const amount = s.market ?? s.mid ?? s.low;
      if (amount != null) push(s.variantId, s.day, amount, s.currency);
    }
  }
  if (manualIds.size) {
    const snaps = await db.priceSnapshot.findMany({
      where: { variantId: { in: [...manualIds] }, source: "MANUAL", ...(fromDay ? { day: { gte: fromDay } } : {}) },
      orderBy: { day: "asc" },
    });
    for (const s of snaps) if (s.market != null) push(s.variantId, s.day, s.market, s.currency);
  }
  return series;
}

export async function availableSources(db: PrismaClient, userId: string, isDemo: boolean): Promise<string[]> {
  if (isDemo) return ["DEMO", "LOCAL"];
  const [cm, local] = await Promise.all([
    db.priceSnapshot.findFirst({ where: { source: "CARDMARKET" }, select: { id: true } }),
    db.localPriceReport.findFirst({ where: { userId }, select: { id: true } }),
  ]);
  return ["TCGPLAYER", ...(local ? ["LOCAL"] : []), ...(cm ? ["CARDMARKET"] : [])];
}

export async function loadLotsAndSales(db: PrismaClient, userId: string) {
  const [lots, sales] = await Promise.all([
    db.lot.findMany({ where: { userId }, orderBy: [{ acquiredOn: "asc" }, { createdAt: "asc" }] }),
    db.sale.findMany({ where: { userId }, include: { allocations: { include: { lot: { select: { currency: true } } } } }, orderBy: { soldOn: "asc" } }),
  ]);
  const lotInputs: LotInput[] = lots.map((l) => ({
    id: l.id,
    variantId: l.variantId,
    quantity: l.quantity,
    remainingQuantity: l.remainingQuantity,
    landedTotal: l.landedTotal,
    currency: l.currency,
    condition: l.condition,
    acquiredDay: dayKey(l.acquiredOn),
  }));
  const saleInputs: SaleInput[] = sales.map((s) => ({
    id: s.id,
    variantId: s.variantId,
    quantity: s.quantity,
    unitPrice: s.unitPrice,
    fees: s.fees,
    currency: s.currency,
    soldDay: dayKey(s.soldOn),
    allocations: s.allocations.map((a) => ({ lotId: a.lotId, quantity: a.quantity, costBasis: a.costBasis, lotCurrency: a.lot.currency })),
  }));
  return { lots, sales, lotInputs, saleInputs };
}

export async function loadVariantInfo(db: PrismaClient, variantIds: string[]) {
  const vs = await db.cardVariant.findMany({
    where: { id: { in: variantIds } },
    include: { card: { select: { id: true, name: true, domains: true, type: true, orientation: true } }, set: { select: { code: true, name: true, rotatesOn: true } } },
  });
  return new Map(
    vs.map((v) => [
      v.id,
      {
        id: v.id,
        cardId: v.card.id,
        name: v.card.name,
        type: v.card.type,
        domains: pipeSplit(v.card.domains),
        orientation: v.card.orientation,
        setCode: v.set.code,
        setName: v.set.name,
        rotatesOn: v.set.rotatesOn,
        collectorNumber: v.collectorNumber,
        rarity: v.rarity ?? "—",
        art: v.art,
        finish: v.finish,
        language: v.language,
        graded: v.gradingCompany ? `${v.gradingCompany} ${v.grade ?? ""}`.trim() : null,
        imageUrl: v.imageUrl,
      },
    ]),
  );
}
export type VariantInfo = NonNullable<ReturnType<Awaited<ReturnType<typeof loadVariantInfo>>["get"]>>;

/** One call for pages that need the current portfolio. */
export async function loadPortfolio(db: PrismaClient, userId: string, opts: { source?: string; display?: string } = {}) {
  const settings = await getSettings(db, userId);
  const display = opts.display ?? settings.displayCurrency;
  const source = opts.source ?? settings.defaultValuationSource;
  const fx = await getFx(db, settings.fxOverrides);
  const { lots, sales, lotInputs, saleInputs } = await loadLotsAndSales(db, userId);
  const variantIds = [...new Set(lots.map((l) => l.variantId))];
  const prices = await getPriceBook(db, userId, variantIds, source);
  const positions = computePositions(lotInputs, prices, fx.table, display, settings.conditionMultipliers);
  const totals = computeTotals(positions, saleInputs, fx.table, display);
  return { settings, display, source, fx, lots, sales, lotInputs, saleInputs, variantIds, prices, positions, totals };
}

/** Currencies a page needs that have no FX rate (USD is the base and always known). */
export function missingRates(table: FxTable, currencies: Iterable<string>): string[] {
  return [...new Set(currencies)].filter((c) => !table[c]);
}

/** Price days present in a series map, ascending. */
export function seriesDays(series: PriceSeries): string[] {
  const days = new Set<string>();
  for (const list of series.values()) for (const p of list) days.add(p.day);
  return [...days].sort();
}
