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
