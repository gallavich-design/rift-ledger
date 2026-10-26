// Which finishes (NORMAL / FOIL) exist for a printing comes from TCGplayer: a printing priced only
// as "Foil" is foil-only. Riftcodex doesn't carry finishes, so catalogue sync creates NORMAL by
// default and this reconciler fixes things up once TCGplayer data is known.
// Variants a person owns, has in a deck or watches are never deleted or converted.

import type { PrismaClient } from "@prisma/client";
import { pipeJoin, pipeSplit } from "./grouping";
import { variantKey } from "./variantKey";

export interface ExistingFinish {
  id: string;
  finish: string;
  referenced: boolean;
}

export interface FinishPlan {
  create: string[];
  convert: { id: string; to: string }[];
  remove: string[];
}

export function planFinishes(existing: ExistingFinish[], desired: string[]): FinishPlan {
  const want = new Set(desired);
  const have = new Set(existing.map((e) => e.finish));
  const missing = [...want].filter((f) => !have.has(f));
  const extras = existing.filter((e) => !want.has(e.finish));
  const plan: FinishPlan = { create: [], convert: [], remove: [] };
  for (const f of missing) {
    const reusable = extras.find((e) => !e.referenced && !plan.convert.some((c) => c.id === e.id));
    if (reusable) plan.convert.push({ id: reusable.id, to: f });
    else plan.create.push(f);
  }
  for (const e of extras) {
    if (plan.convert.some((c) => c.id === e.id)) continue;
    if (!e.referenced) plan.remove.push(e.id);
  }
  return plan;
}

/** Finishes per TCGplayer product id, from the TcgProduct table. */
export async function loadFinishMap(db: PrismaClient): Promise<Map<string, string[]>> {
  const rows = await db.tcgProduct.findMany({ where: { finishes: { not: "" } }, select: { productId: true, finishes: true } });
  return new Map(rows.map((r) => [r.productId, pipeSplit(r.finishes)]));
}

export function finishesFor(tcgplayerId: string | null, map: Map<string, string[]>): string[] {
  return (tcgplayerId && map.get(tcgplayerId)) || ["NORMAL"];
}

export const encodeFinishes = (f: Iterable<string>) => pipeJoin([...new Set(f)].sort());

export async function reconcileFinishes(db: PrismaClient): Promise<{ created: number; converted: number; removed: number }> {
  const finishMap = await loadFinishMap(db);
  const variants = await db.cardVariant.findMany({
    where: { sourceId: { not: null }, isUserCreated: false, language: "EN", gradingCompany: null },
    select: {
      id: true,
      sourceId: true,
      finish: true,
      tcgplayerId: true,
      cardId: true,
      setId: true,
      riftboundId: true,
      collectorNumber: true,
      printName: true,
      rarity: true,
      art: true,
      imageUrl: true,
      artist: true,
      _count: { select: { lots: true, deckCards: true, watches: true, priceSnapshots: true } },
    },
  });
  const byPrinting = new Map<string, typeof variants>();
  for (const v of variants) {
    const list = byPrinting.get(v.sourceId!) ?? [];
    list.push(v);
    byPrinting.set(v.sourceId!, list);
  }
  let created = 0;
  let converted = 0;
  let removed = 0;
  for (const [sourceId, list] of byPrinting) {
    const tcg = list[0].tcgplayerId;
    if (!tcg || !finishMap.has(tcg)) continue; // unknown on TCGplayer → leave as is
    const plan = planFinishes(
      list.map((v) => ({
        id: v.id,
        finish: v.finish,
        // price history counts as a reference too: converting would mislabel it
        referenced: v._count.lots + v._count.deckCards + v._count.watches + v._count.priceSnapshots > 0,
      })),
      finishMap.get(tcg)!,
    );
    if (!plan.create.length && !plan.convert.length && !plan.remove.length) continue;
    const template = list[0];
    await db.$transaction([
      ...plan.convert.map((c) =>
        db.cardVariant.update({
          where: { id: c.id },
          data: { finish: c.to, variantKey: variantKey({ sourceId, finish: c.to, language: "EN" }) },
        }),
      ),
      ...plan.create.map((finish) =>
        db.cardVariant.create({
          data: {
            cardId: template.cardId,
            setId: template.setId,
            sourceId,
            variantKey: variantKey({ sourceId, finish, language: "EN" }),
            riftboundId: template.riftboundId,
            tcgplayerId: template.tcgplayerId,
            collectorNumber: template.collectorNumber,
            printName: template.printName,
            rarity: template.rarity,
            art: template.art,
            imageUrl: template.imageUrl,
            artist: template.artist,
            finish,
          },
        }),
      ),
      ...(plan.remove.length ? [db.cardVariant.deleteMany({ where: { id: { in: plan.remove } } })] : []),
    ]);
    created += plan.create.length;
    converted += plan.convert.length;
    removed += plan.remove.length;
  }
  return { created, converted, removed };
}
