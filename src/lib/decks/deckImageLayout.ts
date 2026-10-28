// Pure layout for the deck image (no JSX, so it's unit-testable): grouping, A4 fit, text colours.

import type { Section } from "./types";
import type { ImageGrouping } from "./imageOptions";

export interface ImageCard {
  cardId: string;
  section: Section;
  quantity: number;
  name: string;
  type: string;
  energy: number | null;
  domains: string[];
  imageUrl: string | null;
  landscape: boolean;
}


export interface DeckImageInput {
  deckName: string;
  legendName: string | null;
  legal: boolean;
  dateLabel: string; // "28 Oct 2026"
  cards: ImageCard[];
  grouping?: ImageGrouping;
  background?: string; // #rrggbb
}

// A4 portrait at 150 dpi.
export const PAGE = { width: 1240, height: 1754 };
export const PAD = 64;
export const HEADER = 214;
export const FOOTER = 64;
export const GROUP_TITLE = 48;
export const GROUP_GAP = 26;
const FRAME_RATIO = 0.045;
const CARD_RATIO = 1039 / 744;
const MIN_COLS = 6;
const MAX_COLS = 16;

/** Relative luminance (WCAG) of #rrggbb. */
function luminance(hex: string) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Text colours that stay readable on the chosen background. */
export function palette(bg: string) {
  const dark = luminance(bg) < 0.22;
  return dark
    ? { dark, ink: "#f5f3ee", ink2: "#d9d5cc", ink3: "#a9a59c", accent: "#a9c1f5", rule: "rgba(255,255,255,0.22)", ok: "#5fd39a", bad: "#ff7a6b" }
    : { dark, ink: "#16181d", ink2: "#3d424b", ink3: "#626873", accent: "#1f4fb5", rule: "rgba(22,24,29,0.16)", ok: "#0b7a43", bad: "#b42318" };
}

export interface Group {
  title: string | null;
  cards: ImageCard[];
}

const byCost = (a: ImageCard, b: ImageCard) => (a.energy ?? 99) - (b.energy ?? 99) || a.name.localeCompare(b.name);
const byName = (a: ImageCard, b: ImageCard) => a.name.localeCompare(b.name);
const copies = (cs: ImageCard[]) => cs.reduce((a, c) => a + c.quantity, 0);
const TYPE_GROUPS = [
  { title: "Units", match: (t: string) => t === "Unit" },
  { title: "Gear", match: (t: string) => t === "Gear" },
  { title: "Spells", match: (t: string) => t === "Spell" },
];

/**
 * Deck order: Legend, runes, battlefields, chosen champion, then the main deck by cost — or, grouped
 * by type, the main deck split into Units / Gear / Spells (anything else under "Other"). Sideboard last.
 */
export function groupCards(cards: ImageCard[], grouping: ImageGrouping): Group[] {
  const live = cards.filter((c) => c.quantity > 0);
  const of = (s: Section) => live.filter((c) => c.section === s);
  const core = [...of("LEGEND").sort(byName), ...of("RUNES").sort(byName), ...of("BATTLEFIELDS").sort(byName), ...of("CHAMPION").sort(byName)];
  const main = of("MAIN").sort(byCost);
  const groups: Group[] = [];
  if (grouping === "type") {
    if (core.length) groups.push({ title: null, cards: core });
    for (const g of TYPE_GROUPS) {
      const cs = main.filter((c) => g.match(c.type));
      if (cs.length) groups.push({ title: `${g.title} · ${copies(cs)}`, cards: cs });
    }
    const other = main.filter((c) => !TYPE_GROUPS.some((g) => g.match(c.type)));
    if (other.length) groups.push({ title: `Other · ${copies(other)}`, cards: other });
  } else if (core.length || main.length) groups.push({ title: null, cards: [...core, ...main] });
  const side = of("SIDEBOARD").sort(byCost);
  if (side.length) groups.push({ title: `Sideboard · ${copies(side)}`, cards: side });
  return groups;
}

export interface Layout {
  cols: number;
  gap: number;
  frame: number;
  tileW: number;
  tileH: number;
  artW: number;
  artH: number;
  badge: number; // badge font size
  height: number; // height the groups take
}

/** The biggest cards that still fit every group on one A4 page. */
export function fitLayout(groups: Group[]): Layout {
  const width = PAGE.width - 2 * PAD;
  const available = PAGE.height - 2 * PAD - HEADER - FOOTER;
  let best: Layout | null = null;
  for (let cols = MIN_COLS; cols <= MAX_COLS; cols++) {
    const gap = Math.max(8, Math.round(width / cols / 11));
    const tileW = Math.floor((width - (cols - 1) * gap) / cols);
    const frame = Math.max(3, Math.round(tileW * FRAME_RATIO));
    const artW = tileW - 2 * frame;
    const artH = Math.round(artW * CARD_RATIO);
    const tileH = artH + 2 * frame;
    const height = groups.reduce((h, g, i) => {
      const rows = Math.ceil(g.cards.length / cols);
      return h + (i ? GROUP_GAP : 0) + (g.title ? GROUP_TITLE : 0) + rows * tileH + Math.max(0, rows - 1) * gap;
    }, 0);
    best = { cols, gap, frame, tileW, tileH, artW, artH, badge: Math.max(13, Math.round(tileW * 0.15)), height };
    if (height <= available) break;
  }
  return best!;
}

