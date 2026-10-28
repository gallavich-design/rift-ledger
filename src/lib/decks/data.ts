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
  setName: string;
  collectorNumber: number | null;
  orientation: string;
  rarity: string | null;
  rulesText: string;
  rulesTextRich: string;
  flavourText: string | null;
}

export async function loadDeckCards(db: PrismaClient, cardIds: string[]): Promise<Map<string, EditorCard>> {
  if (!cardIds.length) return new Map();
  const cards = await db.card.findMany({ where: { id: { in: cardIds } }, include: { set: { select: { code: true, name: true, standardLegal: true, rotatesOn: true } } } });
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
        power: c.power,
        might: c.might,
        imageUrl: c.imageUrl,
        standardLegal: c.set.standardLegal,
        rotatesOn: c.set.rotatesOn ? dayKey(c.set.rotatesOn) : null,
        setCode: c.set.code,
        setName: c.set.name,
        collectorNumber: c.collectorNumber,
        orientation: c.orientation,
        rarity: c.rarity,
        rulesText: c.rulesText,
        rulesTextRich: c.rulesTextRich,
        flavourText: c.flavourText,
      },
    ]),
  );
}

/** A printing's own marker from its name, when it isn't one the art label already says: "(R01c)", "(Vendetta)". */
function marker(printName: string): string {
  const m = printName.match(/\(([^)]*)\)\s*$/);
  if (!m || /^(alternate art|signature|overnumbered|metal|ultimate)$/i.test(m[1].trim())) return "";
  return ` (${m[1].trim()})`;
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
  // Oldest set first, then by number, standard art before others, normal before foil.
  const ART_RANK = ["STANDARD", "ALTERNATE", "OVERNUMBERED", "SIGNATURE", "PROMO", "METAL"];
  variants.sort(
    (a, b) =>
      (a.set.releaseDate?.getTime() ?? Infinity) - (b.set.releaseDate?.getTime() ?? Infinity) ||
      a.set.code.localeCompare(b.set.code) ||
      (a.collectorNumber ?? 0) - (b.collectorNumber ?? 0) ||
      ART_RANK.indexOf(a.art) - ART_RANK.indexOf(b.art) ||
      a.printName.localeCompare(b.printName) ||
      (a.finish === "FOIL" ? 1 : 0) - (b.finish === "FOIL" ? 1 : 0),
  );
  const book = await getPriceBook(db, userId, variants.map((v) => v.id), source);
  const out = new Map<string, CardPricing>();
  for (const v of variants) {
    const q = book.get(v.id);
    let unit: number | null = null;
    if (q && fx[q.currency] && fx[display]) unit = convert(q.amount, q.currency, display, fx);
    const entry = out.get(v.cardId) ?? { cardId: v.cardId, defaultVariantId: null, variants: [] };
    entry.variants.push({
      variantId: v.id,
      label: `${v.set.code}·${String(v.collectorNumber ?? "").padStart(3, "0")} ${ART_LABEL[v.art as VariantArt] ?? v.art}${marker(v.printName)} ${v.finish === "FOIL" ? "Foil" : "Normal"}${v.gradingCompany ? ` ${v.gradingCompany} ${v.grade ?? ""}` : ""}`.trim(),
      unit,
      imageUrl: v.imageUrl ?? v.card.imageUrl,
      art: v.art,
      finish: v.finish,
      number: `${v.set.code}-${String(v.collectorNumber ?? "").padStart(3, "0")}`,
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

/** The art (and card number) of specific printings, without prices — for read-only views. */
export async function loadPrintingArt(db: PrismaClient, variantIds: string[]): Promise<Map<string, { variantId: string; label: string; unit: null; imageUrl: string | null; art: string; finish: string; number: string }[]>> {
  const out = new Map<string, { variantId: string; label: string; unit: null; imageUrl: string | null; art: string; finish: string; number: string }[]>();
  if (!variantIds.length) return out;
  const vs = await db.cardVariant.findMany({ where: { id: { in: variantIds } }, include: { set: { select: { code: true } }, card: { select: { imageUrl: true } } } });
  for (const v of vs) {
    const number = `${v.set.code}-${String(v.collectorNumber ?? "").padStart(3, "0")}`;
    const entry = { variantId: v.id, label: `${number} ${ART_LABEL[v.art as VariantArt] ?? v.art}`, unit: null, imageUrl: v.imageUrl ?? v.card.imageUrl, art: v.art, finish: v.finish, number };
    out.set(v.cardId, [...(out.get(v.cardId) ?? []), entry]);
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
  // Compare calendar days (Asia/Bangkok), not instants: a ban "on 26 Oct" applies all of 26 Oct.
  const today = dayKey();
  const events = (
    await db.rulingEvent.findMany({
      where: { type: { in: ["BAN", "UNBAN"] } },
      orderBy: [{ effectiveOn: "asc" }, { createdAt: "asc" }],
      include: { cards: { include: { card: { select: { name: true } } } } },
    })
  ).filter((e) => dayKey(e.effectiveOn) <= today);
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
