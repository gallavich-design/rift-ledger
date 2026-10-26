// "What can I build?" — ownership and cost summary for a meta list (spec §4.6), built on the deck
// cost engine so the numbers match the deck pages exactly.

import { costDeck, type CardPricing } from "@/lib/decks/cost";
import type { DeckLine } from "@/lib/decks/types";

export interface MetaSummary {
  pctOwned: number; // 0–100, by copies
  missing: number; // copies
  cost: number; // to complete, preferred/default printings
  budget: number; // to complete, cheapest printings
  copies: number;
  unpriced: number;
}

export function summarizeMeta(lines: DeckLine[], owned: Map<string, number>, pricing: Map<string, CardPricing>): MetaSummary {
  const c = costDeck(lines, owned, pricing);
  return {
    pctOwned: c.copies ? (c.ownedCopies / c.copies) * 100 : 0,
    missing: c.missingCopies,
    cost: c.costToComplete,
    budget: c.budgetCostToComplete,
    copies: c.copies,
    unpriced: c.unpriced.length,
  };
}

export type MetaSort = "cheapest" | "owned" | "newest";

export function sortMeta<T extends { summary: MetaSummary; playedOn: string | null; createdAt: string }>(rows: T[], sort: MetaSort): T[] {
  return [...rows].sort((a, b) => {
    if (sort === "cheapest") return a.summary.cost - b.summary.cost || b.summary.pctOwned - a.summary.pctOwned;
    if (sort === "owned") return b.summary.pctOwned - a.summary.pctOwned || a.summary.cost - b.summary.cost;
    return (b.playedOn ?? b.createdAt).localeCompare(a.playedOn ?? a.createdAt);
  });
}
