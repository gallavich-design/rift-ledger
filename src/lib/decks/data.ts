// Loads what the deck editor needs: card facts, per-printing prices, and how many copies you own.

import type { PrismaClient } from "@prisma/client";
import { pipeSplit } from "@/lib/catalog/grouping";
import { ART_LABEL, type VariantArt } from "@/lib/domain/enums";
import { convert, type FxTable } from "@/lib/money/money";
import { dayKey } from "@/config/app";
import { getPriceBook } from "@/lib/portfolio/data";
import type { CardPricing } from "./cost";
import type { DeckCardInfo, DeckLine, Section } from "./types";
import type { SnapshotLine } from "./diff";

export interface EditorCard extends DeckCardInfo {
  setCode: string;
  collectorNumber: number | null;
  orientation: string;
}

export async function loadDeckCards(db: PrismaClient, cardIds: string[]): Promise<Map<string, EditorCard>> {
  if (!cardIds.length) return new Map();
  const cards = await db.card.findMany({ where: { id: { in: cardIds } }, include: { set: { select: { code: true, standardLegal: true, rotatesOn: true } } } });
  return new Map(
    cards.map((c) => [
      c.id,
      {
        cardId: c.id,
        name: c.name,
        type: c.type,
        supertype: c.supertype,
        domains: pipeSplit(c.domains),
        tags: pipeSplit(c.tags),
        energy: c.energy,
        imageUrl: c.imageUrl,
        standardLegal: c.set.standardLegal,
        rotatesOn: c.set.rotatesOn ? dayKey(c.set.rotatesOn) : null,
        setCode: c.set.code,
        collectorNumber: c.collectorNumber,
        orientation: c.orientation,
      },
    ]),
  );
}

/** Prices per printing, in the display currency (manual override > chosen source). */
export async function loadDeckPricing(
  db: PrismaClient,
  userId: string,
  cardIds: string[],
  source: string,
  fx: FxTable,
  display: string,
): Promise<Map<string, CardPricing>> {
  if (!cardIds.length) return new Map();
  const variants = await db.cardVariant.findMany({
    where: { cardId: { in: cardIds } },
    include: { set: { select: { code: true, releaseDate: true } }, card: { select: { imageUrl: true } } },
  });
  const book = await getPriceBook(db, userId, variants.map((v) => v.id), source);
  const out = new Map<string, CardPricing>();
  for (const v of variants) {
    const q = book.get(v.id);
    let unit: number | null = null;
    if (q && fx[q.currency] && fx[display]) unit = convert(q.amount, q.currency, display, fx);
    const entry = out.get(v.cardId) ?? { cardId: v.cardId, defaultVariantId: null, variants: [] };
    entry.variants.push({
      variantId: v.id,
      label: `${v.set.code}·${String(v.collectorNumber ?? "").padStart(3, "0")} ${ART_LABEL[v.art as VariantArt] ?? v.art} ${v.finish === "FOIL" ? "Foil" : "Normal"}${v.gradingCompany ? ` ${v.gradingCompany} ${v.grade ?? ""}` : ""}`.trim(),
      unit,
    });
    out.set(v.cardId, entry);
  }
  // Default printing: the card's base standard art, normal finish if it exists.
  for (const [cardId, entry] of out) {
    const vs = variants.filter((v) => v.cardId === cardId);
    const base = vs.filter((v) => v.imageUrl === v.card.imageUrl && v.art === "STANDARD");
    const pick = base.find((v) => v.finish === "NORMAL") ?? base[0] ?? vs.find((v) => v.art === "STANDARD") ?? vs[0];
    entry.defaultVariantId = pick?.id ?? null;
  }
  return out;
}

/** Copies you own of each card, any printing. */
export async function loadOwned(db: PrismaClient, userId: string, cardIds: string[]): Promise<Map<string, number>> {
  if (!cardIds.length) return new Map();
  const lots = await db.lot.findMany({
    where: { userId, remainingQuantity: { gt: 0 }, variant: { cardId: { in: cardIds } } },
    select: { remainingQuantity: true, variant: { select: { cardId: true } } },
  });
  const m = new Map<string, number>();
  for (const l of lots) m.set(l.variant.cardId, (m.get(l.variant.cardId) ?? 0) + l.remainingQuantity);
  return m;
}

/** Banned card names right now (Phase 4 rulings feed). The config list is merged in by the validator. */
export async function loadBannedNames(db: PrismaClient): Promise<string[]> {
  const events = await db.rulingEvent.findMany({
    where: { type: { in: ["BAN", "UNBAN"] }, effectiveOn: { lte: new Date() } },
    orderBy: { effectiveOn: "asc" },
    include: { cards: { include: { card: { select: { name: true } } } } },
  });
  const state = new Map<string, boolean>();
  for (const e of events) for (const c of e.cards) state.set(c.card.name, e.type === "BAN");
  return [...state.entries()].filter(([, b]) => b).map(([n]) => n);
}

export function toSnapshot(lines: DeckLine[], names: Map<string, string>): SnapshotLine[] {
  return lines
    .filter((l) => l.quantity > 0)
    .map((l) => ({
      cardId: l.cardId,
      name: names.get(l.cardId) ?? "Unknown card",
      section: l.section,
      quantity: l.quantity,
      proxyQuantity: l.proxyQuantity,
      preferredVariantId: l.preferredVariantId ?? null,
    }))
    .sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name));
}

export function deckLinesFromRows(rows: { cardId: string; section: string; quantity: number; proxyQuantity: number; preferredVariantId: string | null }[]): DeckLine[] {
  return rows.map((r) => ({ cardId: r.cardId, section: r.section as Section, quantity: r.quantity, proxyQuantity: r.proxyQuantity, preferredVariantId: r.preferredVariantId }));
}
