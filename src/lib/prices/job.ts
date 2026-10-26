// Daily price job: FX rates → TCGplayer catalogue + prices → finish reconciliation → snapshots.
// Idempotent: every write is an upsert keyed by (variant, source, day) / (base, quote, day),
// so running it twice on one day leaves exactly one snapshot per variant per source.

import type { PrismaClient } from "@prisma/client";
import { dayKey } from "@/config/app";
import { fetchUsdRates } from "@/lib/providers/fx";
import { fetchGroup, fetchGroups, type TcgPriceRow } from "@/lib/providers/tcgcsv";
import { sleep } from "@/lib/providers/http";
import { encodeFinishes, reconcileFinishes } from "@/lib/catalog/finishes";
import { evaluateWatches } from "@/lib/alerts/service";

export interface PriceJobResult {
  day: string;
  fx: { quote: string; rateE6: number; asOf: string }[] | { error: string };
  groups: number;
  products: number;
  snapshots: number;
  sealedSnapshots: number;
  unmatchedPrices: number;
  finishes: { created: number; converted: number; removed: number };
  warnings: string[];
  watchAlerts: number;
  ms: number;
}

const BATCH = 200;

export async function runPriceJob(db: PrismaClient, opts: { day?: string } = {}): Promise<PriceJobResult> {
  const started = Date.now();
  const day = opts.day ?? dayKey();
  const warnings: string[] = [];
  const run = await db.syncRun.create({ data: { kind: "PRICES" } });
  try {
    // 1. FX — a failure here shouldn't block card prices; the app falls back to the last stored rate.
    let fx: PriceJobResult["fx"];
    try {
      const quotes = await fetchUsdRates();
      for (const q of quotes) {
        await db.fxRate.upsert({
          where: { base_quote_day: { base: q.base, quote: q.quote, day } },
          update: { rateE6: q.rateE6, source: `${q.source}, rate date ${q.asOf}`, capturedAt: new Date() },
          create: { base: q.base, quote: q.quote, day, rateE6: q.rateE6, source: `${q.source}, rate date ${q.asOf}` },
        });
      }
      fx = quotes.map(({ quote, rateE6, asOf }) => ({ quote, rateE6, asOf }));
    } catch (e) {
      fx = { error: (e as Error).message };
      warnings.push(`FX fetch failed: ${(e as Error).message}`);
    }

    // 2. TCGplayer catalogue + prices
    const groups = await fetchGroups();
    const allPrices: TcgPriceRow[] = [];
    let productCount = 0;
    for (const g of groups) {
      const { products, prices, unknownSubTypes } = await fetchGroup(g);
      if (unknownSubTypes.length) warnings.push(`${g.name}: ignored price sub-types ${unknownSubTypes.join(", ")}`);
      const finishesByProduct = new Map<string, Set<string>>();
      for (const p of prices) {
        if (p.market == null && p.low == null && p.mid == null) continue;
        const set = finishesByProduct.get(p.productId) ?? new Set<string>();
        set.add(p.finish);
        finishesByProduct.set(p.productId, set);
      }
      for (let i = 0; i < products.length; i += BATCH) {
        await db.$transaction(
          products.slice(i, i + BATCH).map((p) => {
            const data = {
              groupId: p.groupId,
              groupName: p.groupName,
              name: p.name,
              finishes: encodeFinishes(finishesByProduct.get(p.productId) ?? []),
              isSingle: p.isSingle,
              number: p.number,
              rarity: p.rarity,
              imageUrl: p.imageUrl,
              url: p.url,
              releasedOn: p.releasedOn,
            };
            return db.tcgProduct.upsert({ where: { productId: p.productId }, update: data, create: { productId: p.productId, ...data } });
          }),
        );
      }
      productCount += products.length;
      allPrices.push(...prices);
      await sleep(200);
    }

    // 3. Make sure a variant exists for every finish TCGplayer sells.
    const finishes = await reconcileFinishes(db);

    // 4. Snapshots
    const variants = await db.cardVariant.findMany({
      where: { tcgplayerId: { not: null }, language: "EN", gradingCompany: null },
      select: { id: true, tcgplayerId: true, finish: true },
    });
    const byKey = new Map<string, string[]>();
    for (const v of variants) {
      const k = `${v.tcgplayerId}|${v.finish}`;
      byKey.set(k, [...(byKey.get(k) ?? []), v.id]);
    }
    let snapshots = 0;
    let unmatched = 0;
    const writes: { variantId: string; p: TcgPriceRow }[] = [];
    for (const p of allPrices) {
      const ids = byKey.get(`${p.productId}|${p.finish}`);
      if (!ids) {
        unmatched++; // sealed products and sets Riftcodex doesn't list yet
        continue;
      }
      if (p.market == null && p.low == null && p.mid == null) continue;
      for (const variantId of ids) writes.push({ variantId, p });
    }
    for (let i = 0; i < writes.length; i += BATCH) {
      await db.$transaction(
        writes.slice(i, i + BATCH).map(({ variantId, p }) => {
          const data = { market: p.market, low: p.low, mid: p.mid, currency: p.currency, capturedAt: new Date() };
          return db.priceSnapshot.upsert({
            where: { variantId_source_day: { variantId, source: "TCGPLAYER", day } },
            update: data,
            create: { variantId, source: "TCGPLAYER", day, ...data },
          });
        }),
      );
      snapshots += Math.min(BATCH, writes.length - i);
    }

    // 4b. Sealed products (booster boxes, packs…): TcgProduct rows with no collector number/rarity.
    const sealedIds = new Set((await db.tcgProduct.findMany({ where: { isSingle: false }, select: { productId: true } })).map((p) => p.productId));
    const sealedWrites = allPrices.filter((p) => sealedIds.has(p.productId) && !byKey.has(`${p.productId}|${p.finish}`) && (p.market != null || p.low != null || p.mid != null));
    // One price per sealed product: prefer the NORMAL row.
    const sealedByProduct = new Map<string, TcgPriceRow>();
    for (const p of sealedWrites) if (!sealedByProduct.has(p.productId) || p.finish === "NORMAL") sealedByProduct.set(p.productId, p);
    const sealedRows = [...sealedByProduct.values()];
    for (let i = 0; i < sealedRows.length; i += BATCH) {
      await db.$transaction(
        sealedRows.slice(i, i + BATCH).map((p) => {
          const data = { market: p.market, low: p.low, mid: p.mid, currency: p.currency, capturedAt: new Date() };
          return db.sealedPriceSnapshot.upsert({
            where: { tcgplayerId_source_day: { tcgplayerId: p.productId, source: "TCGPLAYER", day } },
            update: data,
            create: { tcgplayerId: p.productId, source: "TCGPLAYER", day, ...data },
          });
        }),
      );
    }
    unmatched -= sealedWrites.length;

    // 5. Watchlist alerts
    let watchAlerts = 0;
    try {
      watchAlerts = await evaluateWatches(db);
    } catch (e) {
      warnings.push(`Watch alerts failed: ${(e as Error).message}`);
    }

    const result: PriceJobResult = {
      watchAlerts,
      day,
      fx,
      groups: groups.length,
      products: productCount,
      snapshots,
      sealedSnapshots: sealedRows.length,
      unmatchedPrices: unmatched,
      finishes,
      warnings,
      ms: Date.now() - started,
    };
    await db.syncRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: true, detail: JSON.stringify(result) } });
    return result;
  } catch (e) {
    await db.syncRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: false, detail: (e as Error).message } });
    throw e;
  }
}
