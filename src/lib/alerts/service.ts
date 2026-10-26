// Creating alerts and evaluating watches. Alerts are de-duplicated per user by dedupeKey, so
// re-running a job never creates the same alert twice.

import type { PrismaClient } from "@prisma/client";
import { addDays, dayKey } from "@/config/app";
import { convert, formatMoney, formatPct } from "@/lib/money/money";
import { getFx, getPriceBook, getPriceSeries, getSettings } from "@/lib/portfolio/data";
import { priceOn } from "@/lib/portfolio/compute";
import { evaluateWatch, type Side } from "./watch";

export interface AlertPayload {
  title: string;
  body: string;
  href?: string;
  [k: string]: unknown;
}

export async function createAlert(db: PrismaClient, userId: string, type: string, payload: AlertPayload, dedupeKey?: string): Promise<boolean> {
  if (dedupeKey) {
    const exists = await db.alert.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey } } });
    if (exists) return false;
  }
  await db.alert.create({ data: { userId, type, payload: JSON.stringify(payload), dedupeKey: dedupeKey ?? null } });
  return true;
}

/**
 * Check watches against current prices. Called after the price job, and after a manual or local
 * price is entered. Returns how many alerts were created.
 */
export async function evaluateWatches(db: PrismaClient, filter: { userId?: string; variantIds?: string[] } = {}): Promise<number> {
  const watches = await db.watchItem.findMany({
    where: { ...(filter.userId ? { userId: filter.userId } : {}), ...(filter.variantIds ? { variantId: { in: filter.variantIds } } : {}) },
    include: { variant: { include: { card: { select: { id: true, name: true } }, set: { select: { code: true } } } }, deck: { select: { id: true, name: true } } },
  });
  const today = dayKey();
  let created = 0;
  const byUser = new Map<string, typeof watches>();
  for (const w of watches) byUser.set(w.userId, [...(byUser.get(w.userId) ?? []), w]);

  for (const [userId, ws] of byUser) {
    const settings = await getSettings(db, userId);
    const fx = await getFx(db, settings.fxOverrides);
    const ids = ws.map((w) => w.variantId);
    const [book, series] = await Promise.all([
      getPriceBook(db, userId, ids, settings.defaultValuationSource),
      getPriceSeries(db, userId, ids, settings.defaultValuationSource, addDays(today, -14)),
    ]);
    for (const w of ws) {
      const currency = w.currency ?? settings.displayCurrency;
      const q = book.get(w.variantId);
      const toWatch = (amount: number, from: string) => (fx.table[from] && fx.table[currency] ? convert(amount, from, currency, fx.table) : null);
      const price = q ? toWatch(q.amount, q.currency) : null;
      const wk = priceOn(series.get(w.variantId), addDays(today, -7));
      const priceWeekAgo = wk ? toWatch(wk.amount, wk.currency) : null;
      const r = evaluateWatch(
        { targetPrice: w.targetPrice, targetDir: (w.targetDir as Side | null) ?? null, movePct: w.movePct, lastSide: (w.lastSide as Side | null) ?? null, lastMoveAlertDay: w.lastMoveAlertDay },
        { day: today, price, priceWeekAgo },
      );
      const name = `${w.variant.card.name} (${w.variant.set.code}·${String(w.variant.collectorNumber ?? "").padStart(3, "0")} ${w.variant.finish === "FOIL" ? "foil" : "normal"})`;
      const href = `/cards/${w.variant.card.id}?v=${w.variantId}`;
      for (const a of r.alerts) {
        if (a.kind === "PRICE_TARGET") {
          const forDeck = w.deck ? ` — a card ${w.deck.name} still needs` : "";
          const ok = await createAlert(
            db,
            userId,
            w.deck ? "DECK_NEED" : "PRICE_TARGET",
            {
              title: `${w.variant.card.name} is ${a.dir === "BELOW" ? "down to" : "up to"} ${formatMoney(a.price, currency)}`,
              body: `${name} ${a.dir === "BELOW" ? "dropped to or below" : "rose to or above"} your target of ${formatMoney(a.target, currency)}${forDeck}. Price: ${q ? q.source.toLowerCase() : ""}.`,
              href,
              watchId: w.id,
            },
            `watch:${w.id}:target:${today}:${a.dir}`,
          );
          if (ok) created++;
        } else {
          const ok = await createAlert(
            db,
            userId,
            "PRICE_MOVE",
            {
              title: `${w.variant.card.name} ${a.pct > 0 ? "▲" : "▼"} ${formatPct(a.pct)} in 7 days`,
              body: `${name}: ${formatMoney(a.from, currency)} → ${formatMoney(a.to, currency)}.`,
              href,
              watchId: w.id,
            },
            `watch:${w.id}:move:${today}`,
          );
          if (ok) created++;
        }
      }
      if (r.lastSide !== w.lastSide || r.lastMoveAlertDay !== w.lastMoveAlertDay) {
        await db.watchItem.update({ where: { id: w.id }, data: { lastSide: r.lastSide, lastMoveAlertDay: r.lastMoveAlertDay } });
      }
    }
  }
  return created;
}
