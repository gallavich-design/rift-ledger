// Card data from TCGplayer (via tcgcsv.com) for sets the main card database (Riftcodex) doesn't list
// yet — e.g. Radiance, released on TCGplayer on 2026-10-23 but absent from Riftcodex on 2026-10-28.
// Every field comes from TCGplayer's product data; nothing is filled in from memory.
//
// It also fills one known gap in sets Riftcodex does list: rune printings. On 2026-10-28 Riftcodex
// had 30 rune printings (Origins, Vendetta, OP promos) while TCGplayer listed 91 — Spiritforged and
// Unleashed runes, every set's alternate-art and promo runes. Runes TCGplayer lists that no Riftcodex
// printing points at (by TCGplayer product id) are added from TCGplayer.
//
// Printings get sourceId "tcg:<productId>". When Riftcodex adds them, the catalogue sync adopts
// these printings by TCGplayer product id (see sync.ts), so your lots, decks and watches carry over.

import type { CardDataProvider, ProviderPrinting, ProviderSet } from "./types";
import { fetchGroups, fetchRawProducts, type TcgGroup, type TcgRawProduct } from "./tcgcsv";
import { sleep } from "./http";

/** Only groups that look like a full card set (not bundles of a few promos) are used as a fallback. */
export const MIN_SINGLES_FOR_FALLBACK = 50;

export const TCG_SOURCE_PREFIX = "tcg:";

const ENTITIES: Record<string, string> = { "&gt;": ">", "&lt;": "<", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
const decode = (s: string) => s.replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e);
const toPlain = (html: string) =>
  decode(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\r/g, ""),
  )
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");

function intOrNull(v: string | undefined): number | null {
  if (v == null || !/^-?\d+$/.test(v.trim())) return null;
  return Number(v.trim());
}

/** "Champion Unit" → { supertype: "Champion", type: "Unit" }; "Signature Spell" → Signature / Spell. */
export function splitCardType(cardType: string): { type: string; supertype: string | null } {
  const words = cardType.trim().split(/\s+/);
  const type = words.pop() ?? cardType;
  return { type, supertype: words.length ? words.join(" ") : null };
}

/**
 * Number like "063/167", "061a/167" (alternate art), "168*\/167" (signature), "176/167" (overnumbered),
 * "R02" / "R02a" (runes). Returns the collector number and what the number itself tells us.
 */
export function parseNumber(raw: string | undefined): { number: number | null; denominator: number | null; letter: boolean; star: boolean } {
  const t = (raw ?? "").trim();
  const m = t.match(/^(\d+)([a-z]?)(\*?)\s*\/\s*(\d+)$/i);
  if (m) return { number: Number(m[1]), denominator: Number(m[4]), letter: !!m[2], star: !!m[3] };
  // Runes: "R04" → 4, the way the card database numbers Vendetta's runes (1–6).
  const rune = t.match(/^R(\d+)([a-z]?)$/i);
  if (rune) return { number: Number(rune[1]), denominator: null, letter: rune[2].toLowerCase() === "a", star: false };
  return { number: null, denominator: null, letter: false, star: false };
}

const SUFFIX = /\s*\(([^)]*)\)\s*$/;

/** TCGplayer suffixes → the printing suffixes the catalogue already understands. */
export function normaliseName(name: string, cardType: string): { base: string; suffix: string | null; kind: "signature" | "overnumbered" | "alternate" | "ultimate" | null } {
  const m = name.match(SUFFIX);
  let base = name;
  let kind: "signature" | "overnumbered" | "alternate" | "ultimate" | null = null;
  if (m) {
    const s = m[1].toLowerCase();
    if (s.includes("signature")) kind = "signature";
    else if (s.includes("overnumbered")) kind = "overnumbered";
    else if (s.includes("alternate art") || s.includes("special art") || /^r\d+a$/i.test(m[1].trim())) kind = "alternate";
    else if (s === "ultimate") kind = "ultimate";
    if (kind) base = name.replace(SUFFIX, "").trim();
    // Other rune suffixes are promo printings of the same rune: "(R01b)", "(R01c)", "(Vendetta)".
    else if (/^rune$/i.test(cardType.trim())) base = name.replace(SUFFIX, "").trim();
  }
  // Legends and champions are written "Name, Title" on TCGplayer and "Name - Title" in the card
  // database; use the database's form so both sources show the same name.
  if (/^(legend|champion unit)$/i.test(cardType.trim())) base = base.replace(/^([^,]+),\s+/, "$1 - ");
  const suffix = kind === "signature" ? "Signature" : kind === "overnumbered" ? "Overnumbered" : kind === "alternate" ? "Alternate Art" : kind === "ultimate" ? "Ultimate" : null;
  return { base, suffix, kind };
}

export function isSingle(p: TcgRawProduct): boolean {
  return p.ext.has("Number") || p.ext.has("Rarity");
}

/** One TCGplayer single → a printing in the same shape Riftcodex delivers. */
export function tcgToPrinting(p: TcgRawProduct, setCode: string): ProviderPrinting {
  const cardType = p.ext.get("Card Type") ?? "Unknown";
  const { type, supertype } = splitCardType(cardType);
  const n = parseNumber(p.ext.get("Number"));
  const name = normaliseName(p.name, cardType);
  const domains = (p.ext.get("Domain") ?? "")
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d && d.toLowerCase() !== "none");
  const desc = p.ext.get("Description") ?? "";
  const flavour = p.ext.get("Flavor Text");
  const playable = ["Unit", "Spell", "Gear"].includes(type);
  const energy = playable ? intOrNull(p.ext.get("Energy Cost")) : null;
  const power = playable ? intOrNull(p.ext.get("Power Cost")) : null;
  return {
    sourceId: `${TCG_SOURCE_PREFIX}${p.productId}`,
    name: name.suffix ? `${name.base} (${name.suffix})` : name.base,
    // Keep TCGplayer's own marker where it tells two printings apart, e.g. "Fury Rune (R01c)" vs "Fury Rune (Vendetta)".
    ...(type === "Rune" && !name.suffix && SUFFIX.test(p.name) ? { printName: decode(p.name.trim()) } : {}),
    riftboundId: null,
    tcgplayerId: p.productId,
    collectorNumber: n.number,
    energy,
    might: type === "Unit" ? intOrNull(p.ext.get("Might")) : null,
    power: power === 0 ? null : power, // TCGplayer writes 0 where a card has no power cost
    type,
    supertype: type === "Rune" ? (supertype ?? "Basic") : supertype,
    rarity: p.ext.get("Rarity") ?? null,
    domains: domains.length ? domains : type === "Battlefield" ? ["Colorless"] : [],
    textPlain: toPlain(desc),
    textRich: desc.replace(/\r/g, ""),
    flavour: flavour ? toPlain(flavour) : null,
    setCode,
    imageUrl: p.imageUrl ? p.imageUrl.replace(/_200w\.jpg$/, "_400w.jpg") : null,
    artist: null,
    tags: (p.ext.get("Tag") ?? "")
      .split(";")
      .map((t) => t.trim())
      .filter(Boolean),
    orientation: type === "Battlefield" ? "landscape" : "portrait",
    flags: {
      signature: name.kind === "signature" || n.star,
      overnumbered: name.kind === "overnumbered" || (n.number != null && n.denominator != null && n.number > n.denominator && !n.star),
      alternateArt: name.kind === "alternate" || n.letter,
    },
  };
}

/** The set's size as printed on its cards: the most common "/NNN". */
function printedSetSize(products: TcgRawProduct[]): number {
  const counts = new Map<number, number>();
  for (const p of products) {
    const d = parseNumber(p.ext.get("Number")).denominator;
    if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

/**
 * Wraps the main provider: its sets and cards, plus any TCGplayer set it doesn't cover yet.
 * A group counts as covered when the main provider lists its TCGplayer id or the same set code.
 * If TCGplayer can't be reached, the main provider's data is returned unchanged.
 */
export function withTcgplayerFallback(
  primary: CardDataProvider,
  opts: { fetchGroupsFn?: () => Promise<TcgGroup[]>; fetchProductsFn?: (groupId: string) => Promise<TcgRawProduct[]> } = {},
): CardDataProvider & { fallbackSets: () => string[]; tcgplayerReachable: () => boolean } {
  const getGroups = opts.fetchGroupsFn ?? fetchGroups;
  const getProducts = opts.fetchProductsFn ?? fetchRawProducts;
  let cache: { sets: ProviderSet[]; printings: ProviderPrinting[]; covered: { group: TcgGroup; code: string }[] } | null = null;
  let runeCache: ProviderPrinting[] | null = null;
  let reachable = true;

  async function fallback(primarySets: ProviderSet[]) {
    if (cache) return cache;
    const coveredIds = new Set(primarySets.map((s) => s.tcgplayerId).filter(Boolean));
    const coveredCodes = new Set(primarySets.map((s) => s.code.toUpperCase()));
    const sets: ProviderSet[] = [];
    const printings: ProviderPrinting[] = [];
    const covered: { group: TcgGroup; code: string }[] = [];
    let groups: TcgGroup[] = [];
    try {
      groups = await getGroups();
    } catch {
      reachable = false;
      cache = { sets, printings, covered };
      return cache;
    }
    for (const g of groups) {
      const code = (g.abbreviation ?? "").toUpperCase();
      if (!code) continue;
      if (coveredIds.has(g.groupId) || coveredCodes.has(code)) {
        covered.push({ group: g, code: primarySets.find((s) => s.tcgplayerId === g.groupId)?.code ?? code });
        continue;
      }
      let products: TcgRawProduct[];
      try {
        products = (await getProducts(g.groupId)).filter(isSingle);
      } catch {
        continue;
      }
      if (products.length < MIN_SINGLES_FOR_FALLBACK) continue;
      sets.push({ sourceId: `${TCG_SOURCE_PREFIX}group:${g.groupId}`, code, name: g.name, cardCount: printedSetSize(products), releaseDate: g.publishedOn, tcgplayerId: g.groupId });
      printings.push(...products.map((p) => tcgToPrinting(p, code)));
      await sleep(150);
    }
    cache = { sets, printings, covered };
    return cache;
  }

  /** Rune printings in sets the main provider covers, that none of its printings point at. */
  async function runeGaps(primarySets: ProviderSet[], own: ProviderPrinting[]) {
    if (runeCache) return runeCache;
    const { covered } = await fallback(primarySets);
    const known = new Set(own.map((p) => p.tcgplayerId).filter(Boolean));
    const out: ProviderPrinting[] = [];
    for (const { group, code } of covered) {
      let products: TcgRawProduct[];
      try {
        products = await getProducts(group.groupId);
      } catch {
        reachable = false;
        continue;
      }
      for (const p of products) if (isSingle(p) && (p.ext.get("Card Type") ?? "").trim() === "Rune" && !known.has(p.productId)) out.push(tcgToPrinting(p, code));
      await sleep(150);
    }
    runeCache = out;
    return out;
  }

  return {
    id: `${primary.id}+tcgplayer`,
    fallbackSets: () => cache?.sets.map((s) => s.code) ?? [],
    /** False when TCGplayer couldn't be reached this run — the sync then keeps TCGplayer-sourced printings. */
    tcgplayerReachable: () => reachable,
    async getSets() {
      const own = await primary.getSets();
      return [...own, ...(await fallback(own)).sets];
    },
    async getCards(setCode?: string) {
      const own = await primary.getCards(setCode);
      const primarySets = await primary.getSets();
      const fb = await fallback(primarySets);
      // Rune gaps are judged against all of the main provider's printings, so a set-filtered call
      // can't mistake another set's printing for a missing one.
      const runes = await runeGaps(primarySets, setCode ? await primary.getCards() : own);
      return [...own, ...[...fb.printings, ...runes].filter((p) => !setCode || p.setCode === setCode)];
    },
    searchCards: (q) => primary.searchCards(q),
    getCard: (id) => primary.getCard(id),
  };
}
