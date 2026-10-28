import type { DeckCardInfo, DeckLine } from "./types";

export interface CurveBucket {
  value: number; // energy (or power) cost
  count: number;
  byDomain: { domain: string; count: number }[]; // stacked in DOMAIN order; sums to count
}

export interface DeckStats {
  curve: { energy: string; count: number }[]; // kept for older callers: 0 … max
  energyCurve: CurveBucket[];
  powerCurve: CurveBucket[];
  types: { key: string; count: number }[];
  domains: { key: string; count: number }[];
  averageEnergy: number | null;
  averagePower: number | null;
  playables: number;
}

const DOMAIN_ORDER = ["Fury", "Calm", "Mind", "Body", "Chaos", "Order", "Colorless"];

function buildCurve(entries: { value: number; quantity: number; domain: string }[], minMax: number): CurveBucket[] {
  const max = Math.max(minMax, ...entries.map((e) => e.value));
  return Array.from({ length: max + 1 }, (_, v) => {
    const here = entries.filter((e) => e.value === v);
    const by = new Map<string, number>();
    for (const e of here) by.set(e.domain, (by.get(e.domain) ?? 0) + e.quantity);
    const byDomain = [...by.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => (DOMAIN_ORDER.indexOf(a.domain) + 99) % 99 - ((DOMAIN_ORDER.indexOf(b.domain) + 99) % 99));
    return { value: v, count: here.reduce((a, e) => a + e.quantity, 0), byDomain };
  });
}

/**
 * Stats over the cards you draw: Chosen Champion + main deck. Curves are stacked by domain; a
 * multi-domain card counts under its first domain so each bar adds up to the cards at that cost.
 */
export function deckStats(lines: DeckLine[], info: Map<string, DeckCardInfo>): DeckStats {
  const play = lines.filter((l) => (l.section === "MAIN" || l.section === "CHAMPION") && l.quantity > 0 && info.has(l.cardId));
  const types = new Map<string, number>();
  const domains = new Map<string, number>();
  const energy: { value: number; quantity: number; domain: string }[] = [];
  const power: { value: number; quantity: number; domain: string }[] = [];
  let playables = 0;
  for (const l of play) {
    const c = info.get(l.cardId)!;
    const ds = c.domains.length ? c.domains : ["Colorless"];
    playables += l.quantity;
    if (c.energy != null) energy.push({ value: c.energy, quantity: l.quantity, domain: ds[0] });
    power.push({ value: c.power ?? 0, quantity: l.quantity, domain: ds[0] });
    types.set(c.type, (types.get(c.type) ?? 0) + l.quantity);
    for (const d of ds) domains.set(d, (domains.get(d) ?? 0) + l.quantity);
  }
  const sorted = (m: Map<string, number>) => [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  const avg = (xs: typeof energy) => {
    const n = xs.reduce((a, x) => a + x.quantity, 0);
    return n ? xs.reduce((a, x) => a + x.value * x.quantity, 0) / n : null;
  };
  const energyCurve = buildCurve(energy, 6);
  return {
    curve: energyCurve.map((b) => ({ energy: String(b.value), count: b.count })),
    energyCurve,
    powerCurve: buildCurve(power, 3),
    types: sorted(types),
    domains: sorted(domains),
    averageEnergy: avg(energy),
    averagePower: avg(power),
    playables,
  };
}
