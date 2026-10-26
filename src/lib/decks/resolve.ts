// Turns parsed decklist lines into deck lines by matching names against the card catalogue.
// Exact (normalised) names match outright; a close typo matches only when the search is confident
// and unambiguous. Everything else is returned as unrecognised, with suggestions.

import { normalizeForSearch, pipeSplit } from "@/lib/catalog/grouping";
import { rankSearchScored, type SearchDoc, type SearchIndex } from "@/lib/catalog/search";
import type { ParsedLine } from "./parse";
import { defaultSection, isChampionUnit, type DeckLine, type Section } from "./types";

export interface UnrecognizedLine {
  lineNo: number;
  raw: string;
  name: string;
  quantity: number;
  sectionHint: Section | null;
  suggestions: { cardId: string; name: string }[];
}

export interface ResolveResult {
  lines: DeckLine[];
  matched: { lineNo: number; raw: string; cardId: string; name: string; fuzzy: boolean }[];
  unrecognized: UnrecognizedLine[];
}

const FUZZY_ACCEPT = 0.9;

export function matchName(idx: SearchIndex, name: string): { doc: SearchDoc; fuzzy: boolean } | { suggestions: SearchDoc[] } {
  const q = normalizeForSearch(name);
  const exact = idx.docs.find((d) => d.doc.searchName === q);
  if (exact) return { doc: exact.doc, fuzzy: false };
  const ranked = rankSearchScored(idx, name, 4);
  const [top, second] = ranked;
  if (top && top.score >= FUZZY_ACCEPT && top.score < 10 && (!second || second.score < top.score - 0.05)) return { doc: top.doc, fuzzy: true };
  return { suggestions: ranked.slice(0, 3).map((r) => r.doc) };
}

export function sectionFor(doc: Pick<SearchDoc, "type">, hint: Section | null): Section {
  const byType = defaultSection(doc);
  if (byType !== "MAIN") return byType; // Legends, Runes and Battlefields always go to their own section
  if (hint === "SIDEBOARD" || hint === "CHAMPION") return hint;
  return "MAIN";
}

export function resolveDecklist(parsed: ParsedLine[], idx: SearchIndex): ResolveResult {
  const merged = new Map<string, DeckLine>();
  const matched: ResolveResult["matched"] = [];
  const unrecognized: UnrecognizedLine[] = [];
  const docs = new Map<string, SearchDoc>();

  for (const p of parsed) {
    const m = matchName(idx, p.name);
    if ("suggestions" in m) {
      unrecognized.push({
        lineNo: p.lineNo,
        raw: p.raw,
        name: p.name,
        quantity: p.quantity,
        sectionHint: p.sectionHint,
        suggestions: m.suggestions.map((d) => ({ cardId: d.id, name: d.name })),
      });
      continue;
    }
    docs.set(m.doc.id, m.doc);
    matched.push({ lineNo: p.lineNo, raw: p.raw, cardId: m.doc.id, name: m.doc.name, fuzzy: m.fuzzy });
    const section = sectionFor(m.doc, p.sectionHint);
    const k = `${section}|${m.doc.id}`;
    const cur = merged.get(k);
    if (cur) cur.quantity += p.quantity;
    else merged.set(k, { cardId: m.doc.id, section, quantity: p.quantity, proxyQuantity: 0 });
  }

  const lines = [...merged.values()];
  // No Chosen Champion given: promote one copy of the first champion unit matching the Legend.
  if (!lines.some((l) => l.section === "CHAMPION")) {
    const legend = lines.find((l) => l.section === "LEGEND");
    const legendTags = legend ? pipeSplit(docs.get(legend.cardId)?.tags ?? "") : [];
    const champ = lines.find((l) => {
      const d = docs.get(l.cardId)!;
      const tags = pipeSplit(d.tags);
      return l.section === "MAIN" && isChampionUnit(d) && tags.some((t) => legendTags.includes(t));
    });
    if (champ) {
      champ.quantity -= 1;
      lines.push({ cardId: champ.cardId, section: "CHAMPION", quantity: 1, proxyQuantity: 0 });
    }
  }
  return { lines: lines.filter((l) => l.quantity > 0), matched, unrecognized };
}
