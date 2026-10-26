// Errata, bans, unbans and rotations (spec §4.7). Entering one notifies every user who owns an
// affected card or has one in a deck. Rotation rulings set the set's Standard rotation date.

import type { PrismaClient } from "@prisma/client";
import { dayKey, dayToDate } from "@/config/app";
import { ROTATION_DATES } from "@/config/rotation";
import { createAlert } from "@/lib/alerts/service";

export const RULING_TYPES = ["ERRATA", "BAN", "UNBAN", "ROTATION"] as const;
export type RulingType = (typeof RULING_TYPES)[number];

export const RULING_LABEL: Record<RulingType, string> = { ERRATA: "Errata", BAN: "Ban", UNBAN: "Unban", ROTATION: "Rotation" };

export interface RulingInput {
  type: RulingType;
  title: string;
  effectiveOn: string; // YYYY-MM-DD
  summary?: string | null;
  oldText?: string | null;
  newText?: string | null;
  sourceUrl?: string | null;
  cardIds: string[];
  setCode?: string | null;
}

/** A set's rotation date: its latest rotation ruling, else config/rotation.ts. */
export async function effectiveRotation(db: PrismaClient, setCode: string): Promise<Date | null> {
  const r = await db.rulingEvent.findFirst({ where: { type: "ROTATION", setCode }, orderBy: [{ createdAt: "desc" }] });
  if (r) return r.effectiveOn;
  const cfg = ROTATION_DATES[setCode];
  return cfg ? new Date(`${cfg}T00:00:00Z`) : null;
}

async function applyRotation(db: PrismaClient, setCode: string) {
  const rotatesOn = await effectiveRotation(db, setCode);
  await db.set.updateMany({ where: { code: setCode }, data: { rotatesOn } });
}

/** Cards a ruling touches: the listed cards, plus every card of the set for a rotation. */
export async function affectedCardIds(db: PrismaClient, ruling: { id: string; type: string; setCode: string | null }): Promise<string[]> {
  const listed = (await db.rulingEventCard.findMany({ where: { rulingId: ruling.id }, select: { cardId: true } })).map((c) => c.cardId);
  if (ruling.type !== "ROTATION" || !ruling.setCode) return listed;
  const inSet = await db.card.findMany({ where: { set: { code: ruling.setCode } }, select: { id: true } });
  return [...new Set([...listed, ...inSet.map((c) => c.id)])];
}

export async function createRuling(db: PrismaClient, input: RulingInput) {
  const ruling = await db.rulingEvent.create({
    data: {
      type: input.type,
      title: input.title,
      effectiveOn: dayToDate(input.effectiveOn),
      summary: input.summary || null,
      oldText: input.oldText || null,
      newText: input.newText || null,
      sourceUrl: input.sourceUrl || null,
      setCode: input.type === "ROTATION" ? input.setCode || null : null,
      cards: { create: [...new Set(input.cardIds)].map((cardId) => ({ cardId })) },
    },
  });
  if (ruling.setCode) await applyRotation(db, ruling.setCode);
  const alerts = await notifyRuling(db, ruling.id);
  return { ruling, alerts };
}

export async function deleteRuling(db: PrismaClient, id: string) {
  const r = await db.rulingEvent.delete({ where: { id } });
  if (r.setCode) await applyRotation(db, r.setCode);
  return r;
}

/** One alert per user who owns an affected card or has one in a deck. */
export async function notifyRuling(db: PrismaClient, rulingId: string): Promise<number> {
  const ruling = await db.rulingEvent.findUniqueOrThrow({ where: { id: rulingId } });
  const cardIds = await affectedCardIds(db, ruling);
  if (!cardIds.length) return 0;
  const [lots, deckCards, cards] = await Promise.all([
    db.lot.findMany({ where: { remainingQuantity: { gt: 0 }, variant: { cardId: { in: cardIds } } }, select: { userId: true, variant: { select: { cardId: true } } } }),
    db.deckCard.findMany({ where: { cardId: { in: cardIds } }, select: { cardId: true, deck: { select: { id: true, name: true, userId: true } } } }),
    db.card.findMany({ where: { id: { in: cardIds } }, select: { id: true, name: true } }),
  ]);
  const names = new Map(cards.map((c) => [c.id, c.name]));
  const users = new Map<string, { owned: Set<string>; decks: Map<string, { name: string; cards: Set<string> }> }>();
  const u = (id: string) => users.get(id) ?? users.set(id, { owned: new Set(), decks: new Map() }).get(id)!;
  for (const l of lots) u(l.userId).owned.add(l.variant.cardId);
  for (const dc of deckCards) {
    const e = u(dc.deck.userId);
    const d = e.decks.get(dc.deck.id) ?? { name: dc.deck.name, cards: new Set<string>() };
    d.cards.add(dc.cardId);
    e.decks.set(dc.deck.id, d);
  }

  const verb: Record<string, string> = { ERRATA: "errata'd", BAN: "banned", UNBAN: "unbanned", ROTATION: "rotating out of Standard" };
  const when = dayKey(ruling.effectiveOn);
  let n = 0;
  for (const [userId, e] of users) {
    const touched = [...new Set([...e.owned, ...[...e.decks.values()].flatMap((d) => [...d.cards])])];
    const cardList = touched.slice(0, 4).map((id) => names.get(id)).join(", ") + (touched.length > 4 ? ` and ${touched.length - 4} more` : "");
    const deckList = [...e.decks.entries()].map(([id, d]) => ({ id, name: d.name, count: d.cards.size }));
    const deckText = deckList.length ? ` Affects ${deckList.map((d) => `${d.name} (${d.count})`).join(", ")}.` : "";
    const title =
      ruling.type === "ROTATION"
        ? `${touched.length} of your cards rotate out on ${when}`
        : `${touched.length === 1 ? names.get(touched[0]) : `${touched.length} of your cards`} ${verb[ruling.type]} on ${when}`;
    const ok = await createAlert(
      db,
      userId,
      `RULING_${ruling.type}`,
      { title, body: `${ruling.title}. ${cardList}.${deckText}`, href: `/news/${ruling.id}`, rulingId: ruling.id, deckIds: deckList.map((d) => d.id), cardIds: touched },
      `ruling:${ruling.id}`,
    );
    if (ok) n++;
  }
  return n;
}

/** Recent errata (and current bans) touching a deck's cards — for deck badges. */
export async function deckRulingBadges(db: PrismaClient, cardIds: string[], sinceDays = 90) {
  if (!cardIds.length) return { errata: [] as { date: string; count: number }[] };
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const rows = await db.rulingEventCard.findMany({
    where: { cardId: { in: cardIds }, ruling: { type: "ERRATA", effectiveOn: { gte: since } } },
    include: { ruling: { select: { effectiveOn: true } } },
  });
  const byDate = new Map<string, Set<string>>();
  for (const r of rows) {
    const d = dayKey(r.ruling.effectiveOn);
    byDate.set(d, (byDate.get(d) ?? new Set()).add(r.cardId));
  }
  return { errata: [...byDate.entries()].map(([date, s]) => ({ date, count: s.size })).sort((a, b) => b.date.localeCompare(a.date)) };
}
