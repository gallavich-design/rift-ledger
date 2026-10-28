// Spec §4.5 cost panel and §5 Example D. Ownership counts any printing of the card; proxies count
// for legality but are never "owned", so they show up in cost to complete and the still-to-buy list.

import type { DeckLine } from "./types";

export interface VariantPrice {
  variantId: string;
  label: string;
  unit: number | null; // display currency minor units, NM
}

export interface CardPricing {
  cardId: string;
  defaultVariantId: string | null; // printing used when no preference is set
  variants: VariantPrice[];
}

export interface CostLine {
  cardId: string;
  quantity: number;
  proxies: number;
  owned: number; // copies counted as owned for this deck
  missing: number;
  normal: VariantPrice | null; // preferred (or default) printing
  cheapest: VariantPrice | null;
  missingCost: number; // missing × normal unit
  budgetMissingCost: number;
}

export interface DeckCost {
  lines: CostLine[];
  value: number; // whole deck at market, preferred printings
  budgetValue: number; // whole deck, cheapest printing of every card
  ownedValue: number;
  costToComplete: number;
  budgetCostToComplete: number;
  copies: number;
  ownedCopies: number;
  missingCopies: number;
  unpriced: string[]; // cardIds with no price at all
  swaps: { cardId: string; from: VariantPrice; to: VariantPrice; quantity: number; saving: number }[];
}

export function costDeck(lines: DeckLine[], owned: Map<string, number>, pricing: Map<string, CardPricing>): DeckCost {
  // Aggregate per card across sections (owned copies are shared between e.g. Champion and Main).
  const agg = new Map<string, { quantity: number; proxies: number; preferred: string | null }>();
  for (const l of lines) {
    if (l.quantity <= 0) continue;
    const a = agg.get(l.cardId) ?? { quantity: 0, proxies: 0, preferred: null };
    a.quantity += l.quantity;
    a.proxies += Math.min(l.proxyQuantity, l.quantity);
    a.preferred ??= l.preferredVariantId ?? null;
    agg.set(l.cardId, a);
  }

  const out: DeckCost = {
    lines: [],
    value: 0,
    budgetValue: 0,
    ownedValue: 0,
    costToComplete: 0,
    budgetCostToComplete: 0,
    copies: 0,
    ownedCopies: 0,
    missingCopies: 0,
    unpriced: [],
    swaps: [],
  };

  for (const [cardId, a] of agg) {
    const p = pricing.get(cardId);
    const priced = (p?.variants ?? []).filter((v) => v.unit != null);
    const byId = (id: string | null) => (id ? (p?.variants.find((v) => v.variantId === id) ?? null) : null);
    const preferred = byId(a.preferred);
    const fallback = byId(p?.defaultVariantId ?? null);
    const cheapest = priced.length ? priced.reduce((m, v) => (v.unit! < m.unit! ? v : m)) : null;
    // Normal build: your chosen printing → the default printing → the cheapest priced one.
    const normal = preferred?.unit != null ? preferred : fallback?.unit != null ? fallback : cheapest;
    const ownedHere = Math.min(owned.get(cardId) ?? 0, a.quantity - a.proxies);
    const missing = a.quantity - ownedHere;
    const nu = normal?.unit ?? 0;
    const bu = cheapest?.unit ?? 0;
    const line: CostLine = {
      cardId,
      quantity: a.quantity,
      proxies: a.proxies,
      owned: ownedHere,
      missing,
      normal,
      cheapest,
      missingCost: missing * nu,
      budgetMissingCost: missing * bu,
    };
    out.lines.push(line);
    out.value += a.quantity * nu;
    out.budgetValue += a.quantity * bu;
    out.ownedValue += ownedHere * nu;
    out.costToComplete += line.missingCost;
    out.budgetCostToComplete += line.budgetMissingCost;
    out.copies += a.quantity;
    out.ownedCopies += ownedHere;
    out.missingCopies += missing;
    if (!normal) out.unpriced.push(cardId);
    if (normal && cheapest && cheapest.variantId !== normal.variantId && cheapest.unit! < normal.unit!) {
      out.swaps.push({ cardId, from: normal, to: cheapest, quantity: a.quantity, saving: (normal.unit! - cheapest.unit!) * a.quantity });
    }
  }
  out.swaps.sort((x, y) => y.saving - x.saving);
  return out;
}

export interface ShortfallLine {
  cardId: string;
  add: number; // copies to add to the collection
  proxies: number; // proxied copies in the deck
  variantId: string | null; // printing to add: your chosen one, else the default
  unit: number | null; // its price, display currency
}

/**
 * "I own all of these": how many copies of each card to add so the collection covers the deck.
 * Counts any printing you already own. Proxied copies are left alone unless `includeProxies`
 * (you've since got the real cards). Same pricing choice as cost to complete.
 */
export function ownershipShortfall(lines: DeckLine[], owned: Map<string, number>, pricing: Map<string, CardPricing>, includeProxies: boolean): ShortfallLine[] {
  const cost = costDeck(lines, owned, pricing);
  const out: ShortfallLine[] = [];
  for (const l of cost.lines) {
    const need = includeProxies ? l.quantity : l.quantity - l.proxies;
    const add = Math.max(0, need - (owned.get(l.cardId) ?? 0));
    if (!add) continue;
    // Same printing cost to complete uses (chosen → default → cheapest priced), so the totals agree.
    const p = pricing.get(l.cardId);
    const preferred = lines.find((x) => x.cardId === l.cardId && x.preferredVariantId)?.preferredVariantId ?? null;
    const variantId = l.normal?.variantId ?? preferred ?? p?.defaultVariantId ?? p?.variants[0]?.variantId ?? null;
    out.push({ cardId: l.cardId, add, proxies: l.proxies, variantId, unit: l.normal?.unit ?? null });
  }
  return out;
}
