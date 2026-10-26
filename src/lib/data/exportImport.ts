// Full data export / import (spec §9). The export is one JSON file holding everything you entered,
// plus the catalogue rows and price history it depends on, so importing it into a fresh database
// (even one that hasn't synced cards yet) reproduces the same dashboard totals.
//
// Catalogue ids differ between databases, so references are carried by stable keys: a printing by
// CardVariant.variantKey, a card by Card.key, a set by Set.code. Your own rows keep their ids.
// Not exported: alerts (notifications are regenerated), demo data, sync logs.

import type { PrismaClient } from "@prisma/client";

export const EXPORT_VERSION = 1;

type Row = Record<string, unknown>;
export interface ExportFile {
  format: "rift-ledger-export";
  version: number;
  exportedAt: string;
  catalog: { sets: Row[]; cards: Row[]; variants: Row[]; tcgProducts: Row[] };
  prices: { snapshots: Row[]; sealedSnapshots: Row[]; fx: Row[] };
  rulings: { events: Row[]; cards: Row[] };
  user: Record<(typeof USER_TABLES)[number], Row[]> & { settings: Row | null };
}

// Insert order respects foreign keys.
const USER_TABLES = [
  "storageLocation",
  "order",
  "sealedProduct",
  "packOpening",
  "lot",
  "sale",
  "saleAllocation",
  "manualPrice",
  "localPriceReport",
  "deck",
  "deckCard",
  "deckVersion",
  "matchResult",
  "metaDeck",
  "metaDeckCard",
  "watchItem",
  "tradeListItem",
] as const;
type UserTable = (typeof USER_TABLES)[number];

const omit = (r: Row, ...keys: string[]) => Object.fromEntries(Object.entries(r).filter(([k]) => !keys.includes(k)));

export async function exportAll(db: PrismaClient, userId: string): Promise<ExportFile> {
  const u = { where: { userId } };
  const [storageLocation, order, sealedProduct, packOpening, lot, sale, manualPrice, localPriceReport, deck, matchResult, metaDeck, watchItem, tradeListItem, settings] = await Promise.all([
    db.storageLocation.findMany(u),
    db.order.findMany(u),
    db.sealedProduct.findMany(u),
    db.packOpening.findMany(u),
    db.lot.findMany(u),
    db.sale.findMany(u),
    db.manualPrice.findMany(u),
    db.localPriceReport.findMany(u),
    db.deck.findMany(u),
    db.matchResult.findMany(u),
    db.metaDeck.findMany(u),
    db.watchItem.findMany(u),
    db.tradeListItem.findMany(u),
    db.settings.findUnique({ where: { userId } }),
  ]);
  const [saleAllocation, deckCard, deckVersion, metaDeckCard] = await Promise.all([
    db.saleAllocation.findMany({ where: { saleId: { in: sale.map((s) => s.id) } } }),
    db.deckCard.findMany({ where: { deckId: { in: deck.map((d) => d.id) } } }),
    db.deckVersion.findMany({ where: { deckId: { in: deck.map((d) => d.id) } } }),
    db.metaDeckCard.findMany({ where: { metaDeckId: { in: metaDeck.map((d) => d.id) } } }),
  ]);
  const [events, rulingCards] = await Promise.all([db.rulingEvent.findMany(), db.rulingEventCard.findMany()]);

  // Catalogue rows referenced by anything above.
  const variantIds = new Set<string>([...lot, ...sale, ...manualPrice, ...localPriceReport, ...watchItem, ...tradeListItem].map((r) => r.variantId));
  for (const d of deckCard) if (d.preferredVariantId) variantIds.add(d.preferredVariantId);
  const variants = await db.cardVariant.findMany({ where: { id: { in: [...variantIds] } } });
  const cardIds = new Set<string>([...variants.map((v) => v.cardId), ...deckCard.map((d) => d.cardId), ...metaDeckCard.map((d) => d.cardId), ...rulingCards.map((r) => r.cardId)]);
  const cards = await db.card.findMany({ where: { id: { in: [...cardIds] } } });
  const setIds = new Set<string>([...variants.map((v) => v.setId), ...cards.map((c) => c.setId), ...(sealedProduct.map((s) => s.setId).filter(Boolean) as string[])]);
  const sets = await db.set.findMany({ where: { id: { in: [...setIds] } } });
  const tcgIds = sealedProduct.map((s) => s.tcgplayerId).filter(Boolean) as string[];
  const [tcgProducts, snapshots, sealedSnapshots, fx] = await Promise.all([
    db.tcgProduct.findMany({ where: { productId: { in: tcgIds } } }),
    db.priceSnapshot.findMany({ where: { variantId: { in: [...variantIds] }, source: { not: "DEMO" } } }),
    db.sealedPriceSnapshot.findMany({ where: { tcgplayerId: { in: tcgIds } } }),
    db.fxRate.findMany(),
  ]);
  const setCode = new Map(sets.map((s) => [s.id, s.code]));
  const cardKey = new Map(cards.map((c) => [c.id, c.key]));
  const vKey = new Map(variants.map((v) => [v.id, v.variantKey]));
  const refV = (r: Row, f = "variantId") => ({ ...omit(r, f), [`${f}Key`]: r[f] ? vKey.get(r[f] as string) : null });
  const refC = (r: Row) => ({ ...omit(r, "cardId"), cardKey: cardKey.get(r.cardId as string) });

  return {
    format: "rift-ledger-export",
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    catalog: {
      sets: sets.map((s) => omit(s, "id")),
      cards: cards.map((c) => ({ ...omit(c, "id", "setId"), setCode: setCode.get(c.setId), exportId: c.id })),
      variants: variants.map((v) => ({ ...omit(v, "id", "setId", "cardId"), setCode: setCode.get(v.setId), cardKey: cardKey.get(v.cardId) })),
      tcgProducts,
    },
    prices: { snapshots: snapshots.map((s) => omit(refV(s), "id")), sealedSnapshots: sealedSnapshots.map((s) => omit(s, "id")), fx: fx.map((f) => omit(f, "id")) },
    rulings: { events, cards: rulingCards.map((r) => refC(r)) },
    user: {
      settings: settings ? omit(settings, "id", "userId") : null,
      storageLocation,
      order,
      sealedProduct: sealedProduct.map((s) => ({ ...omit(s, "setId"), setCode: s.setId ? setCode.get(s.setId) : null })),
      packOpening,
      lot: lot.map((r) => refV(r)),
      sale: sale.map((r) => refV(r)),
      saleAllocation,
      manualPrice: manualPrice.map((r) => refV(r)),
      localPriceReport: localPriceReport.map((r) => refV(r)),
      deck,
      deckCard: deckCard.map((r) => refV(refC(r), "preferredVariantId")),
      deckVersion,
      matchResult,
      metaDeck,
      metaDeckCard: metaDeckCard.map((r) => refC(r)),
      watchItem: watchItem.map((r) => refV(r)),
      tradeListItem: tradeListItem.map((r) => refV(r)),
    } as ExportFile["user"],
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
/** JSON.parse reviver: ISO timestamps back to Date (day keys like 2026-10-26 stay strings). */
export const reviveDates = (_k: string, v: unknown) => (typeof v === "string" && ISO.test(v) ? new Date(v) : v);

export class ImportError extends Error {}

export async function userHasData(db: PrismaClient, userId: string) {
  const counts = await Promise.all([
    db.lot.count({ where: { userId } }),
    db.sealedProduct.count({ where: { userId } }),
    db.deck.count({ where: { userId } }),
    db.order.count({ where: { userId } }),
    db.storageLocation.count({ where: { userId } }),
    db.watchItem.count({ where: { userId } }),
    db.tradeListItem.count({ where: { userId } }),
  ]);
  return counts.some((c) => c > 0);
}

export interface ImportSummary {
  catalog: { sets: number; cards: number; variants: number };
  rows: Record<string, number>;
  prices: number;
}

export async function importAll(db: PrismaClient, userId: string, file: ExportFile): Promise<ImportSummary> {
  if (file?.format !== "rift-ledger-export") throw new ImportError("That isn't a Rift Ledger export file.");
  if (file.version > EXPORT_VERSION) throw new ImportError(`This export is from a newer version (v${file.version}). Update the app first.`);
  if (await userHasData(db, userId)) throw new ImportError("Import goes into an empty collection, so nothing gets mixed or duplicated. This account already has data.");

  const summary: ImportSummary = { catalog: { sets: 0, cards: 0, variants: 0 }, rows: {}, prices: 0 };
  await db.$transaction(
    async (tx) => {
      // 1. Catalogue — match by stable keys, create what's missing.
      const setId = new Map<string, string>();
      for (const s of file.catalog.sets) {
        const code = s.code as string;
        const found = await tx.set.findUnique({ where: { code } });
        if (found) setId.set(code, found.id);
        else {
          const sourceTaken = s.sourceId ? await tx.set.findUnique({ where: { sourceId: s.sourceId as string } }) : null;
          const created = await tx.set.create({ data: { ...(s as never as object), sourceId: sourceTaken ? null : (s.sourceId as string | null) } as never });
          setId.set(code, created.id);
          summary.catalog.sets++;
        }
      }
      const needSet = (code: unknown) => {
        const id = setId.get(code as string);
        if (!id) throw new ImportError(`The export refers to set ${String(code)}, which it doesn't include.`);
        return id;
      };
      const cardId = new Map<string, string>();
      const oldCardId = new Map<string, string>(); // exporting database's card id → this database's
      for (const c of file.catalog.cards) {
        const key = c.key as string;
        const found = await tx.card.findUnique({ where: { key } });
        if (found) cardId.set(key, found.id);
        else {
          const created = await tx.card.create({ data: { ...omit(c, "setCode", "exportId"), setId: needSet(c.setCode) } as never });
          cardId.set(key, created.id);
          summary.catalog.cards++;
        }
        if (c.exportId) oldCardId.set(c.exportId as string, cardId.get(key)!);
      }
      const variantId = new Map<string, string>();
      for (const v of file.catalog.variants) {
        const key = v.variantKey as string;
        const found = await tx.cardVariant.findUnique({ where: { variantKey: key } });
        if (found) variantId.set(key, found.id);
        else {
          const cid = cardId.get(v.cardKey as string);
          if (!cid) throw new ImportError(`A printing in the export refers to a card it doesn't include (${key}).`);
          const created = await tx.cardVariant.create({ data: { ...omit(v, "setCode", "cardKey", "updatedAt"), setId: needSet(v.setCode), cardId: cid } as never });
          variantId.set(key, created.id);
          summary.catalog.variants++;
        }
      }
      for (const p of file.catalog.tcgProducts) {
        await tx.tcgProduct.upsert({ where: { productId: p.productId as string }, update: {}, create: p as never });
      }
      const V = (k: unknown) => {
        if (k == null) return null;
        const id = variantId.get(k as string);
        if (!id) throw new ImportError(`The export refers to a printing it doesn't include (${String(k)}).`);
        return id;
      };
      const C = (k: unknown) => {
        const id = cardId.get(k as string);
        if (!id) throw new ImportError(`The export refers to a card it doesn't include (${String(k)}).`);
        return id;
      };

      // Card ids also appear inside deck-version JSON (snapshot / diff); rewrite old → new.
      const rewriteIds = (json: unknown) => {
        if (typeof json !== "string") return json;
        let out = json;
        for (const [from, to] of oldCardId) if (from !== to && out.includes(from)) out = out.split(from).join(to);
        return out;
      };

      // 2. Price history and FX (skip rows that already exist).
      for (const s of file.prices.snapshots) {
        const vid = V(s.variantIdKey)!;
        const data = { ...omit(s, "variantIdKey"), variantId: vid };
        await tx.priceSnapshot.upsert({ where: { variantId_source_day: { variantId: vid, source: s.source as string, day: s.day as string } }, update: {}, create: data as never });
        summary.prices++;
      }
      for (const s of file.prices.sealedSnapshots) {
        await tx.sealedPriceSnapshot.upsert({ where: { tcgplayerId_source_day: { tcgplayerId: s.tcgplayerId as string, source: s.source as string, day: s.day as string } }, update: {}, create: s as never });
      }
      for (const f of file.prices.fx) {
        await tx.fxRate.upsert({ where: { base_quote_day: { base: f.base as string, quote: f.quote as string, day: f.day as string } }, update: {}, create: f as never });
      }

      // 3. Rulings (shared across users) — keep ids, skip existing.
      for (const e of file.rulings.events) if (!(await tx.rulingEvent.findUnique({ where: { id: e.id as string } }))) await tx.rulingEvent.create({ data: e as never });
      for (const r of file.rulings.cards) {
        const cid = C(r.cardKey);
        await tx.rulingEventCard.upsert({ where: { rulingId_cardId: { rulingId: r.rulingId as string, cardId: cid } }, update: {}, create: { ...omit(r, "cardKey"), cardId: cid } as never });
      }

      // 4. Your rows, re-pointed at this account and this database's catalogue.
      const map = (t: UserTable, r: Row): Row => {
        let out: Row = { ...r };
        if ("userId" in out) out.userId = userId;
        if ("variantIdKey" in out) out = { ...omit(out, "variantIdKey"), variantId: V(r.variantIdKey) };
        if ("preferredVariantIdKey" in out) out = { ...omit(out, "preferredVariantIdKey"), preferredVariantId: V(r.preferredVariantIdKey) };
        if ("cardKey" in out) out = { ...omit(out, "cardKey"), cardId: C(r.cardKey) };
        if (t === "deckVersion") out = { ...out, snapshot: rewriteIds(out.snapshot), diff: rewriteIds(out.diff) };
        if (t === "sealedProduct") out = { ...omit(out, "setCode"), setId: r.setCode ? (setId.get(r.setCode as string) ?? null) : null };
        return out;
      };
      const models = tx as unknown as Record<UserTable, { create(a: { data: Row }): Promise<unknown> }>;
      for (const t of USER_TABLES) {
        let n = 0;
        for (const r of (file.user[t] ?? []) as Row[]) {
          let data = map(t, r);
          if (t === "deck" && data.shareToken && (await tx.deck.findUnique({ where: { shareToken: data.shareToken as string } }))) data = { ...data, shareToken: null };
          await models[t].create({ data });
          n++;
        }
        summary.rows[t] = n;
      }

      // 5. Settings
      if (file.user.settings) {
        const s = { ...file.user.settings } as Row;
        if (s.tradeShareToken && (await tx.settings.findUnique({ where: { tradeShareToken: s.tradeShareToken as string } }))) s.tradeShareToken = null;
        await tx.settings.upsert({ where: { userId }, update: s as never, create: { ...s, userId } as never });
      }
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
  return summary;
}
