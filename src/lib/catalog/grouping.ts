// Turns upstream printings into game Cards + CardVariants.
// Riftcodex has one record per printing; alternate art / overnumbered / signature / metal / promo
// reprints of the same card share a base name like "Vi - Piltover Enforcer".

import type { ProviderPrinting } from "@/lib/providers/types";
import type { VariantArt } from "@/lib/domain/enums";

const PRINT_SUFFIX = /\s*\(([^)]*)\)\s*$/;
// Suffixes that mark a printing rather than a different card. "Sprite (274) // Buff" style tokens are NOT stripped.
const KNOWN_PRINT_SUFFIXES = new Set([
  "alternate art",
  "overnumbered",
  "signature",
  "metal",
  "starter",
  "ultimate",
  "launch exclusive",
  "gg ez",
]);
export const PROMO_SET_CODES = new Set(["OPP", "PR", "JDG"]);

export function baseName(printName: string): string {
  const m = printName.match(PRINT_SUFFIX);
  if (m && KNOWN_PRINT_SUFFIXES.has(m[1].trim().toLowerCase())) return printName.replace(PRINT_SUFFIX, "").trim();
  return printName.trim();
}

export function printSuffix(printName: string): string | null {
  const m = printName.match(PRINT_SUFFIX);
  return m && KNOWN_PRINT_SUFFIXES.has(m[1].trim().toLowerCase()) ? m[1].trim() : null;
}

/**
 * Stable grouping key stored in Card.key. FROZEN: changing this re-keys every card on the next
 * sync, so it must not share code with search normalisation (which is free to evolve).
 */
export function cardKey(p: Pick<ProviderPrinting, "name" | "type">): string {
  const name = baseName(p.name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return `${name}|${p.type.toLowerCase()}`;
}

/** Search normalisation: "Kai'Sa" → "kaisa", "Sett, Brawler" → "sett brawler". */
export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function artOf(p: ProviderPrinting): VariantArt {
  if (p.flags.signature) return "SIGNATURE";
  if (p.flags.overnumbered) return "OVERNUMBERED";
  if (p.flags.alternateArt) return "ALTERNATE";
  const suffix = printSuffix(p.name)?.toLowerCase();
  if (suffix === "metal") return "METAL";
  if (p.rarity === "Promo" || PROMO_SET_CODES.has(p.setCode)) return "PROMO";
  return "STANDARD";
}

export const pipeJoin = (xs: string[]) => (xs.length ? `|${xs.join("|")}|` : "");
export const pipeSplit = (s: string) => s.split("|").filter(Boolean);

export interface GroupedCard {
  key: string;
  name: string;
  base: ProviderPrinting; // printing whose data represents the game card
  printings: ProviderPrinting[];
}

/**
 * Group printings into cards. The base printing is the one most likely to carry the
 * canonical rules text: standard art, non-promo set, earliest release, longest text.
 */
export function groupPrintings(printings: ProviderPrinting[], setReleaseDates: Map<string, Date | null>): GroupedCard[] {
  const groups = new Map<string, ProviderPrinting[]>();
  for (const p of printings) {
    const k = cardKey(p);
    const list = groups.get(k);
    if (list) list.push(p);
    else groups.set(k, [p]);
  }
  const time = (code: string) => setReleaseDates.get(code)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return [...groups.entries()].map(([key, list]) => {
    const ranked = [...list].sort((a, b) => {
      const sa = artOf(a) === "STANDARD" ? 0 : 1;
      const sb = artOf(b) === "STANDARD" ? 0 : 1;
      if (sa !== sb) return sa - sb;
      if (time(a.setCode) !== time(b.setCode)) return time(a.setCode) - time(b.setCode);
      if (a.textPlain.length !== b.textPlain.length) return b.textPlain.length - a.textPlain.length;
      return (a.collectorNumber ?? 0) - (b.collectorNumber ?? 0);
    });
    // Upstream sometimes writes "Sett, Brawler" for "Sett - Brawler"; prefer the dash form for display.
    const names = ranked.map((p) => baseName(p.name));
    const name = names.find((n) => n.includes(" - ")) ?? names[0];
    return { key, name, base: ranked[0], printings: list };
  });
}
