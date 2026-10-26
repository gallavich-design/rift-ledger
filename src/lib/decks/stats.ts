import type { DeckCardInfo, DeckLine } from "./types";

export interface DeckStats {
  curve: { energy: string; count: number }[]; // 0 … 6, 7+
  types: { key: string; count: number }[];
  domains: { key: string; count: number }[];
  averageEnergy: number | null;
  playables: number;
}

/** Stats over the cards you draw: Chosen Champion + main deck. */
export function deckStats(lines: DeckLine[], info: Map<string, DeckCardInfo>): DeckStats {
  const play = lines.filter((l) => (l.section === "MAIN" || l.section === "CHAMPION") && l.quantity > 0 && info.has(l.cardId));
  const curve = Array.from({ length: 8 }, (_, i) => ({ energy: i === 7 ? "7+" : String(i), count: 0 }));
  const types = new Map<string, number>();
  const domains = new Map<string, number>();
  let energySum = 0;
  let energyCount = 0;
  let playables = 0;
  for (const l of play) {
    const c = info.get(l.cardId)!;
    playables += l.quantity;
    if (c.energy != null) {
      curve[Math.min(c.energy, 7)].count += l.quantity;
      energySum += c.energy * l.quantity;
      energyCount += l.quantity;
    }
    types.set(c.type, (types.get(c.type) ?? 0) + l.quantity);
    for (const d of c.domains.length ? c.domains : ["Colorless"]) domains.set(d, (domains.get(d) ?? 0) + l.quantity);
  }
  const sorted = (m: Map<string, number>) => [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  return { curve, types: sorted(types), domains: sorted(domains), averageEnergy: energyCount ? energySum / energyCount : null, playables };
}
