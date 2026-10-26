// One function that builds the whole portfolio picture — cards + sealed — for a user, valuation
// source and display currency. The dashboard and the value report both use it, so their totals
// can't drift apart.

import type { PrismaClient } from "@prisma/client";
import { dayKey } from "@/config/app";
import { getFx, getPriceBook, getPriceSeries, getSettings, loadLotsAndSales, loadVariantInfo, missingRates, seriesDays } from "./data";
import { computeHistory, computePositions, computeTotals } from "./compute";
import { computeSealedPositions, loadSealed, loadSealedPrices, sealedHistory } from "@/lib/sealed/value";

export async function buildPortfolio(db: PrismaClient, userId: string, opts: { source: string; display?: string }) {
  const settings = await getSettings(db, userId);
  const display = opts.display ?? settings.displayCurrency;
  const source = opts.source;
  const [fx, { lots, lotInputs, saleInputs }, sealedRows] = await Promise.all([getFx(db, settings.fxOverrides), loadLotsAndSales(db, userId), loadSealed(db, userId)]);
  const variantIds = [...new Set(lots.map((l) => l.variantId))];
  const [prices, series, info, sealedSeries] = await Promise.all([
    getPriceBook(db, userId, variantIds, source),
    getPriceSeries(db, userId, variantIds, source),
    loadVariantInfo(db, variantIds),
    loadSealedPrices(db, sealedRows),
  ]);
  const missing = missingRates(fx.table, [
    display,
    ...lots.map((l) => l.currency),
    ...[...prices.values()].map((p) => p.currency),
    ...saleInputs.map((s) => s.currency),
    ...sealedRows.map((s) => s.currency),
    ...[...sealedSeries.values()].flatMap((s) => s.map((x) => x.currency)),
  ]);
  if (missing.length) return { ok: false as const, missing, settings, display, source, fx };

  const positions = computePositions(lotInputs, prices, fx.table, display, settings.conditionMultipliers);
  const cardTotals = computeTotals(positions, saleInputs, fx.table, display);
  const sealed = computeSealedPositions(sealedRows, sealedSeries, fx.table, display);
  const sealedValue = sealed.reduce((a, s) => a + (s.value ?? 0), 0);
  const sealedCost = sealed.reduce((a, s) => a + s.cost, 0);
  const sealedPricedCost = sealed.filter((s) => s.value != null).reduce((a, s) => a + s.cost, 0);

  const value = cardTotals.value + sealedValue;
  const pricedCost = cardTotals.pricedCost + sealedPricedCost;
  const totals = {
    ...cardTotals,
    value,
    cost: cardTotals.cost + sealedCost,
    pricedCost,
    unrealized: value - pricedCost,
    unrealizedPct: pricedCost ? ((value - pricedCost) / pricedCost) * 100 : null,
    unpricedPositions: cardTotals.unpricedPositions + sealed.filter((s) => s.value == null).length,
    cardsValue: cardTotals.value,
    sealedValue,
    sealedCost,
  };

  const days = [...new Set([...seriesDays(series), ...[...sealedSeries.values()].flatMap((s) => s.map((x) => x.day))])].sort();
  const cardHist = computeHistory(days, lotInputs, saleInputs, series, fx.table, display, settings.conditionMultipliers);
  const sealedHist = sealedHistory(days, sealedRows, sealedSeries, fx.table, display);
  const cardByDay = new Map(cardHist.map((h) => [h.day, h]));
  const firstDay = [...lotInputs.map((l) => l.acquiredDay), ...sealedRows.map((s) => s.acquiredDay)].sort()[0];
  const history = sealedHist
    .filter((s) => firstDay && s.day >= firstDay)
    .map((s) => ({ day: s.day, value: s.value + (cardByDay.get(s.day)?.value ?? 0), cost: s.cost + (cardByDay.get(s.day)?.cost ?? 0) }));

  return {
    ok: true as const,
    settings,
    display,
    source,
    fx,
    today: dayKey(),
    lots,
    lotInputs,
    saleInputs,
    prices,
    series,
    info,
    positions,
    sealed,
    sealedRows,
    totals,
    days,
    history,
  };
}
export type Portfolio = Extract<Awaited<ReturnType<typeof buildPortfolio>>, { ok: true }>;
