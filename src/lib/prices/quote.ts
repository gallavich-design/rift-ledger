// Unit prices for a list of printings, converted into one currency. Pack opening and the trade
// calculator both use this, and it reads the same price book (default valuation source, manual
// override wins) as the dashboard and card pages — so their numbers agree.

import type { PrismaClient } from "@prisma/client";
import { availableSources, getFx, getPriceBook, getSettings, missingRates } from "@/lib/portfolio/data";
import { convert } from "@/lib/money/money";

export interface UnitQuote {
  unit: number; // minor units of the requested currency
  original: number;
  originalCurrency: string;
  source: string;
  asOf: string; // ISO
  detail?: string;
}

export async function valuationSource(db: PrismaClient, userId: string, demo: boolean) {
  const settings = await getSettings(db, userId);
  const sources = await availableSources(db, userId, demo);
  return sources.includes(settings.defaultValuationSource) ? settings.defaultValuationSource : sources[0];
}

export async function quoteVariants(db: PrismaClient, userId: string, demo: boolean, variantIds: string[], currency?: string) {
  const settings = await getSettings(db, userId);
  const target = currency ?? settings.displayCurrency;
  const source = await valuationSource(db, userId, demo);
  const [fx, book] = await Promise.all([getFx(db, settings.fxOverrides), getPriceBook(db, userId, [...new Set(variantIds)], source)]);
  const missing = missingRates(fx.table, [target, ...[...book.values()].map((q) => q.currency)]);
  const out: Record<string, UnitQuote> = {};
  if (missing.length) return { source, currency: target, quotes: out, missing };
  for (const [id, q] of book) {
    out[id] = { unit: convert(q.amount, q.currency, target, fx.table), original: q.amount, originalCurrency: q.currency, source: q.source, asOf: q.asOf.toISOString(), detail: q.detail };
  }
  return { source, currency: target, quotes: out, missing };
}
