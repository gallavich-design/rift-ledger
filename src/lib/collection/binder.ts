import type { PrismaClient } from "@prisma/client";

// Set completion binder (spec §4.3): one slot per collector number in a set's checklist.

export interface ChecklistSlot {
  number: number;
  cardId: string;
  name: string;
  rarity: string | null;
  imageUrl: string | null;
  variantIds: string[]; // every printing that fills this slot
  cheapest: number | null; // display currency, cheapest priced printing
}

export interface BinderSlot extends ChecklistSlot {
  owned: number;
}

export function completeBinder(slots: ChecklistSlot[], ownedByVariant: Map<string, number>) {
  const out: BinderSlot[] = slots
    .map((s) => ({ ...s, owned: s.variantIds.reduce((a, v) => a + (ownedByVariant.get(v) ?? 0), 0) }))
    .sort((a, b) => a.number - b.number);
  const have = out.filter((s) => s.owned > 0).length;
  const missing = out.filter((s) => s.owned === 0);
  return {
    slots: out,
    have,
    total: out.length,
    pct: out.length ? (have / out.length) * 100 : 0,
    costToComplete: missing.reduce((a, s) => a + (s.cheapest ?? 0), 0),
    unpricedMissing: missing.filter((s) => s.cheapest == null).length,
  };
}

// ───────────── The checklist itself (shared by the binder page and "Complete the set") ─────────────


export type BinderScope = "base" | "all";

export interface SetSlot {
  key: string; // cardId|number|art
  number: number;
  cardId: string;
  name: string;
  rarity: string | null;
  imageUrl: string | null;
  art: string;
  landscape: boolean;
  /** English, ungraded printings that fill this slot (normal and foil share a slot). */
  printings: { id: string; finish: string }[];
  /** Every variant that counts toward the slot — also graded and foreign-language copies. */
  variantIds: string[];
}

/** One slot per printing (card + number + art) in a set: the base set (standard + promo art) or every printing. */
export async function loadSetSlots(db: PrismaClient, setId: string, scope: BinderScope, ownedVariantIds: string[] = []): Promise<SetSlot[]> {
  const variants = await db.cardVariant.findMany({
    where: { setId, language: "EN", gradingCompany: null, ...(scope === "base" ? { art: { in: ["STANDARD", "PROMO"] } } : {}) },
    select: { id: true, cardId: true, collectorNumber: true, art: true, finish: true, rarity: true, imageUrl: true, card: { select: { name: true, orientation: true } } },
  });
  // Graded / foreign copies count toward their printing's slot too.
  const extra = ownedVariantIds.length
    ? await db.cardVariant.findMany({
        where: { setId, OR: [{ language: { not: "EN" } }, { gradingCompany: { not: null } }], id: { in: ownedVariantIds } },
        select: { id: true, cardId: true, collectorNumber: true, art: true },
      })
    : [];
  const slots = new Map<string, SetSlot>();
  for (const v of variants) {
    const key = `${v.cardId}|${v.collectorNumber}|${v.art}`;
    const s = slots.get(key) ?? {
      key,
      number: v.collectorNumber ?? 9999,
      cardId: v.cardId,
      name: v.card.name,
      rarity: v.rarity,
      imageUrl: v.imageUrl,
      art: v.art,
      landscape: v.card.orientation === "landscape",
      printings: [],
      variantIds: [],
    };
    s.printings.push({ id: v.id, finish: v.finish });
    s.variantIds.push(v.id);
    if (v.finish === "NORMAL" && v.imageUrl) s.imageUrl = v.imageUrl;
    slots.set(key, s);
  }
  for (const e of extra) slots.get(`${e.cardId}|${e.collectorNumber}|${e.art}`)?.variantIds.push(e.id);
  return [...slots.values()];
}

/**
 * "Complete the set": the printing to add for every slot you have none of — the normal finish where
 * the printing has one (that's how the slot is collected), else its only finish. One copy each.
 */
export function missingToAdd(slots: SetSlot[], ownedByVariant: Map<string, number>): { slot: SetSlot; variantId: string }[] {
  return slots
    .filter((s) => s.variantIds.every((v) => !ownedByVariant.get(v)))
    .sort((a, b) => a.number - b.number || a.name.localeCompare(b.name))
    .map((s) => ({ slot: s, variantId: (s.printings.find((p) => p.finish === "NORMAL") ?? s.printings[0]).id }));
}
