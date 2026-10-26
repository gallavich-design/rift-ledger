// Card catalog sync: Riftcodex → local DB. Idempotent — upserts keyed by Set.code, Card.key and
// CardVariant.sourceId, so re-running never creates duplicates.

import type { PrismaClient } from "@prisma/client";
import type { CardDataProvider } from "@/lib/providers/types";
import { ROTATION_DATES, NON_STANDARD_SET_CODES } from "@/config/rotation";
import { artOf, groupPrintings, normalizeForSearch, pipeJoin } from "./grouping";
import { invalidateSearchIndex } from "./search";
import { finishesFor, loadFinishMap, reconcileFinishes } from "./finishes";
import { variantKey } from "./variantKey";

export interface SyncResult {
  sets: number;
  cards: number;
  variants: number; // printings processed
  removedVariants: number;
  ms: number;
}

const BATCH = 100;

export async function syncCatalog(db: PrismaClient, provider: CardDataProvider, now = new Date()): Promise<SyncResult> {
  const started = Date.now();
  const run = await db.syncRun.create({ data: { kind: "CARDS" } });
  try {
    const sets = await provider.getSets();
    const printings = await provider.getCards();

    // Sets
    const setIdByCode = new Map<string, string>();
    for (const s of sets) {
      const rotates = ROTATION_DATES[s.code];
      const data = {
        name: s.name,
        cardCount: s.cardCount,
        releaseDate: s.releaseDate,
        tcgplayerId: s.tcgplayerId,
        sourceId: s.sourceId,
        status: s.releaseDate && s.releaseDate > now ? "PREVIEW" : "RELEASED",
        rotatesOn: rotates ? new Date(`${rotates}T00:00:00Z`) : null,
        standardLegal: !NON_STANDARD_SET_CODES.has(s.code),
        syncedAt: now,
      };
      const row = await db.set.upsert({ where: { code: s.code }, update: data, create: { code: s.code, ...data } });
      setIdByCode.set(s.code, row.id);
    }
    // Printings may reference a set not listed by /sets — create a stub rather than drop them.
    for (const p of printings) {
      if (!setIdByCode.has(p.setCode)) {
        const row = await db.set.upsert({
          where: { code: p.setCode },
          update: {},
          create: { code: p.setCode, name: p.setCode, status: "RELEASED" },
        });
        setIdByCode.set(p.setCode, row.id);
      }
    }

    const releaseDates = new Map(sets.map((s) => [s.code, s.releaseDate]));
    const groups = groupPrintings(printings, releaseDates);

    const finishMap = await loadFinishMap(db);
    let variants = 0;
    for (let i = 0; i < groups.length; i += BATCH) {
      const chunk = groups.slice(i, i + BATCH);
      await db.$transaction(async (tx) => {
        for (const g of chunk) {
          const b = g.base;
          const cardData = {
            name: g.name,
            type: b.type,
            supertype: b.supertype,
            domains: pipeJoin(b.domains),
            energy: b.energy,
            might: b.might,
            power: b.power,
            rulesText: b.textPlain,
            rulesTextRich: b.textRich,
            flavourText: b.flavour,
            rarity: b.rarity,
            tags: pipeJoin(b.tags),
            orientation: b.orientation,
            imageUrl: b.imageUrl,
            searchName: normalizeForSearch(g.name),
            setId: setIdByCode.get(b.setCode)!,
            collectorNumber: b.collectorNumber,
            riftboundId: b.riftboundId,
            tcgplayerId: b.tcgplayerId,
          };
          const card = await tx.card.upsert({ where: { key: g.key }, update: cardData, create: { key: g.key, ...cardData } });
          for (const p of g.printings) {
            const vData = {
              cardId: card.id,
              setId: setIdByCode.get(p.setCode)!,
              riftboundId: p.riftboundId,
              tcgplayerId: p.tcgplayerId,
              collectorNumber: p.collectorNumber,
              printName: p.name,
              rarity: p.rarity,
              art: artOf(p),
              imageUrl: p.imageUrl,
              artist: p.artist,
            };
            // A printing may already have several variants (NORMAL + FOIL, graded copies…):
            // refresh shared printing data on all of them; create only when the printing is new.
            const updated = await tx.cardVariant.updateMany({ where: { sourceId: p.sourceId, isUserCreated: false }, data: vData });
            if (updated.count === 0) {
              for (const finish of finishesFor(p.tcgplayerId, finishMap)) {
                await tx.cardVariant.create({
                  data: { sourceId: p.sourceId, variantKey: variantKey({ sourceId: p.sourceId, finish, language: "EN" }), finish, ...vData },
                });
              }
            }
            variants++;
          }
        }
      });
    }

    // Upstream printings that disappeared: remove only if nothing references them.
    const live = new Set(printings.map((p) => p.sourceId));
    const stale = await db.cardVariant.findMany({
      where: { sourceId: { not: null }, isUserCreated: false },
      select: { id: true, sourceId: true, _count: { select: { lots: true, deckCards: true, watches: true } } },
    });
    const removable = stale.filter(
      (v) => !live.has(v.sourceId!) && v._count.lots + v._count.deckCards + v._count.watches === 0,
    );
    if (removable.length) await db.cardVariant.deleteMany({ where: { id: { in: removable.map((v) => v.id) } } });

    await reconcileFinishes(db);

    // Cards left with no printings (e.g. upstream regrouped a name) and nothing pointing at them.
    await db.card.deleteMany({
      where: { variants: { none: {} }, deckCards: { none: {} }, metaCards: { none: {} }, rulings: { none: {} } },
    });

    const result: SyncResult = {
      sets: setIdByCode.size,
      cards: groups.length,
      variants,
      removedVariants: removable.length,
      ms: Date.now() - started,
    };
    await db.syncRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), ok: true, detail: JSON.stringify(result) },
    });
    invalidateSearchIndex();
    return result;
  } catch (err) {
    await db.syncRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), ok: false, detail: (err as Error).message },
    });
    throw err;
  }
}
