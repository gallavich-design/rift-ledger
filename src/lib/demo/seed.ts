// "Load demo data" — a separate demo account with a few months of history so the app looks alive.
// Never mixes with real data: the demo user owns its own rows, and its price history is written
// under the "DEMO" source, which the owner's views never read. Seller and location names are
// prefixed "DEMO". Cards are real catalogue cards so the art shows.

import type { PrismaClient } from "@prisma/client";
import { addDays, dayKey, dayToDate } from "@/config/app";
import { DEMO_EMAIL } from "@/lib/currentUser";
import { allocateLandedCost } from "@/lib/money/landedCost";
import { consumeFifo } from "@/lib/money/fifo";
import { convert } from "@/lib/money/money";

const HISTORY_DAYS = 180;

/** Small deterministic PRNG so demo data is the same every time. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function clearDemo(db: PrismaClient) {
  await db.priceSnapshot.deleteMany({ where: { source: "DEMO" } });
  await db.user.deleteMany({ where: { email: DEMO_EMAIL } }); // cascades to everything the demo user owns
}

export async function seedDemo(db: PrismaClient): Promise<{ cards: number; days: number }> {
  await clearDemo(db);
  const today = dayKey();
  const rand = mulberry32(20261026);

  // Real, priced printings: a spread from chase cards to bulk.
  const priced = await db.priceSnapshot.findMany({
    where: { source: "TCGPLAYER", market: { gt: 25 } },
    orderBy: [{ day: "desc" }, { market: "desc" }],
    distinct: ["variantId"],
    take: 600,
    select: { variantId: true, market: true },
  });
  if (priced.length < 20) throw new Error("Run the price job first — demo data is built on real TCGplayer prices.");
  priced.sort((a, b) => b.market! - a.market!);
  const picks = [14, 25, 38, 52, 70, 95, 125, 160, 200, 250, 310, 380, 450, 540].map((i) => priced[Math.min(i, priced.length - 1)]);
  const unique = [...new Map(picks.map((p) => [p.variantId, p])).values()];

  // FX for THB purchases (fall back to a fixed example rate if the job hasn't stored one).
  const thb = (await db.fxRate.findFirst({ where: { base: "USD", quote: "THB" }, orderBy: { day: "desc" } }))?.rateE6 ?? 33_000_000;
  const fx = { USD: 1_000_000, THB: thb };

  // Price history under source DEMO: a random walk that ends at today's real market price.
  const history = new Map<string, { day: string; price: number }[]>();
  for (const p of unique) {
    const vol = 0.012 + rand() * 0.025;
    const drift = (rand() - 0.45) * 0.004;
    const walk = [0];
    for (let i = 1; i <= HISTORY_DAYS; i++) walk.push(walk[i - 1] + drift + (rand() - 0.5) * 2 * vol);
    const end = walk[HISTORY_DAYS];
    const series = walk.map((w, i) => ({ day: addDays(today, i - HISTORY_DAYS), price: Math.max(5, Math.round(p.market! * Math.exp(w - end))) }));
    history.set(p.variantId, series);
  }
  const priceOn = (variantId: string, day: string) => history.get(variantId)!.find((x) => x.day === day)?.price ?? history.get(variantId)!.at(-1)!.price;

  const user = await db.user.create({
    data: { email: DEMO_EMAIL, name: "Demo", isDemo: true, settings: { create: { displayCurrency: "THB", defaultValuationSource: "DEMO" } } },
  });

  await db.$transaction(
    [...history.entries()].flatMap(([variantId, series]) =>
      series.map((s) =>
        db.priceSnapshot.create({ data: { variantId, source: "DEMO", day: s.day, market: s.price, mid: Math.round(s.price * 1.08), low: Math.round(s.price * 0.9), currency: "USD", capturedAt: dayToDate(s.day) } }),
      ),
    ),
  );

  const [binder, deckbox, bulk] = await Promise.all([
    db.storageLocation.create({ data: { userId: user.id, name: "DEMO Binder 1", type: "BINDER" } }),
    db.storageLocation.create({ data: { userId: user.id, name: "DEMO Deck box – Fury", type: "DECK_BOX" } }),
    db.storageLocation.create({ data: { userId: user.id, name: "DEMO Bulk box A", type: "BULK_BOX" } }),
  ]);
  const ids = [...history.keys()];

  async function order(daysAgo: number, seller: string, currency: "USD" | "THB", lines: { i: number; qty: number; discount: number; loc: string }[], extras: { shipping?: number; forwardingFee?: number; importTax?: number }) {
    const day = addDays(today, -daysAgo);
    const priced = lines.map((l) => {
      const usd = Math.round(priceOn(ids[l.i], day) * l.discount);
      return { ...l, variantId: ids[l.i], unitPrice: currency === "USD" ? usd : Math.round(convert(usd, "USD", "THB", fx) / 100) * 100 };
    });
    const extraTotal = (extras.shipping ?? 0) + (extras.forwardingFee ?? 0) + (extras.importTax ?? 0);
    const landed = allocateLandedCost(priced.map((p, k) => ({ key: String(k), quantity: p.qty, unitPrice: p.unitPrice })), extraTotal);
    const o = await db.order.create({ data: { userId: user.id, orderedOn: dayToDate(day), seller, currency, shipping: extras.shipping ?? 0, forwardingFee: extras.forwardingFee ?? 0, importTax: extras.importTax ?? 0 } });
    for (const [k, p] of priced.entries()) {
      await db.lot.create({
        data: {
          userId: user.id,
          orderId: o.id,
          variantId: p.variantId,
          quantity: p.qty,
          remainingQuantity: p.qty,
          unitPrice: p.unitPrice,
          landedTotal: landed[k].landedTotal,
          landedUnitCost: landed[k].landedUnitCost,
          currency,
          condition: "NM",
          acquiredOn: dayToDate(day),
          storageLocationId: p.loc,
        },
      });
    }
  }

  await order(160, "DEMO TCGplayer via forwarder", "USD", [
    { i: 0, qty: 1, discount: 0.95, loc: binder.id },
    { i: 2, qty: 1, discount: 1, loc: binder.id },
    { i: 5, qty: 2, discount: 1, loc: deckbox.id },
    { i: 9, qty: 3, discount: 0.9, loc: deckbox.id },
  ], { shipping: 500, forwardingFee: 2000, importTax: 1500 });
  await order(110, "DEMO Facebook group", "THB", [
    { i: 1, qty: 1, discount: 0.85, loc: binder.id },
    { i: 7, qty: 2, discount: 1, loc: bulk.id },
  ], {});
  await order(70, "DEMO TCGplayer via forwarder", "USD", [
    { i: 3, qty: 1, discount: 1, loc: binder.id },
    { i: 4, qty: 1, discount: 1.05, loc: binder.id },
    { i: 9, qty: 1, discount: 1, loc: deckbox.id },
    { i: 11, qty: 4, discount: 1, loc: bulk.id },
  ], { shipping: 400, forwardingFee: 1800, importTax: 900 });
  await order(25, "DEMO Local shop", "THB", [
    { i: 6, qty: 1, discount: 1.1, loc: binder.id },
    { i: 8, qty: 2, discount: 1, loc: deckbox.id },
    { i: 12, qty: 3, discount: 1, loc: bulk.id },
  ], {});

  // One sale: 2 copies of the card bought in the first and third orders → FIFO takes the oldest.
  const saleDay = addDays(today, -18);
  const lots = await db.lot.findMany({ where: { userId: user.id, variantId: ids[9] } });
  const alloc = consumeFifo(lots, 2);
  await db.sale.create({
    data: {
      userId: user.id,
      variantId: ids[9],
      quantity: 2,
      unitPrice: Math.round(priceOn(ids[9], saleDay) * 1.05),
      fees: 150,
      currency: "USD",
      soldOn: dayToDate(saleDay),
      buyer: "DEMO buyer",
      allocations: { create: alloc.map((a) => ({ lotId: a.lotId, quantity: a.quantity, costBasis: a.costBasis })) },
    },
  });
  for (const a of alloc) await db.lot.update({ where: { id: a.lotId }, data: { remainingQuantity: { decrement: a.quantity } } });

  // Local (Thailand) sightings, so the source switcher and "import or buy local?" have data.
  for (const [n, i] of [0, 2, 5, 9, 1, 3, 7].entries()) {
    for (const back of [60, 21, 4]) {
      const day = addDays(today, -back - n);
      const thbPrice = Math.round((convert(priceOn(ids[i], day), "USD", "THB", fx) * (1.05 + rand() * 0.3)) / 1000) * 1000;
      await db.localPriceReport.create({
        data: { userId: user.id, variantId: ids[i], price: thbPrice, currency: "THB", whereSeen: back === 4 ? "DEMO Local shop" : "DEMO Facebook group", seenOn: dayToDate(day) },
      });
    }
  }

  return { cards: unique.length, days: HISTORY_DAYS };
}
