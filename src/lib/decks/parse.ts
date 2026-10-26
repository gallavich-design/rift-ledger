// Plain-text decklist import. Tolerant of the common shapes people paste:
//   "Legend:" / "Champion:" / "Main Deck:" / "Runes:" / "Battlefields:" / "Sideboard:" headers
//   "3 Jinx - Loose Cannon", "3x Name", "Name x3", "Name (3)", or just "Name" (1 copy)
// Unknown names are returned, never silently dropped, so the person can fix them.

import type { Section } from "./types";

export interface ParsedLine {
  lineNo: number;
  raw: string;
  quantity: number;
  name: string;
  sectionHint: Section | null;
}

const HEADERS: [RegExp, Section][] = [
  [/^(champion\s+)?legends?$/, "LEGEND"],
  [/^(chosen\s+)?champions?$/, "CHAMPION"],
  [/^(main(\s*deck)?|deck|maindeck|cards)$/, "MAIN"],
  [/^(runes?|rune\s*(deck|pool))$/, "RUNES"],
  [/^battlefields?$/, "BATTLEFIELDS"],
  [/^(side\s*board|side)$/, "SIDEBOARD"],
];

export function sectionFromHeader(line: string): Section | null {
  const h = line
    .toLowerCase()
    .replace(/^[#/*\s-]+/, "")
    .replace(/[:\s]*(\(\s*\d+\s*\)|\d+)?\s*:?\s*$/, "")
    .trim();
  for (const [re, s] of HEADERS) if (re.test(h)) return s;
  return null;
}

export function parseDecklistText(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  let section: Section | null = null;
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const raw = rawLine.trim();
    if (!raw || /^(\/\/|#(?!\w))/.test(raw)) return;
    const header = sectionFromHeader(raw);
    if (header && !/^\d/.test(raw)) {
      section = header;
      return;
    }
    let qty = 1;
    let name = raw;
    let m: RegExpMatchArray | null;
    if ((m = raw.match(/^(\d{1,2})\s*[x×]?\s+(.+)$/i))) {
      qty = Number(m[1]);
      name = m[2];
    } else if ((m = raw.match(/^(.+?)\s+[x×]\s*(\d{1,2})$/i)) || (m = raw.match(/^(.+?)\s*\((\d{1,2})\)$/))) {
      name = m[1];
      qty = Number(m[2]);
    }
    // strip trailing set/collector references: "(OGN) 123", "[OGN-123]", "OGN-123", "#123"
    name = name
      .replace(/\s*[[(][A-Z]{2,4}[\s-]?\d*[a-z*]?[\])]\s*\d*$/i, "")
      .replace(/\s+[A-Z]{2,4}-\d{1,3}[a-z*]?$/, "")
      .replace(/\s+#\d+$/, "")
      .trim();
    if (!name || qty < 1) return;
    out.push({ lineNo: i + 1, raw, quantity: qty, name, sectionHint: section });
  });
  return out;
}
