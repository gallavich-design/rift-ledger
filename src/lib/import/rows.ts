// Turns pasted text — a CSV with a header row, or a plain list like "3 Jinx - Rebel" — into purchase
// rows. Pure: resolving names to printings happens on the server (resolve.ts).

import { parseCsv } from "./csv";
import { parseMoneyInput } from "@/lib/money/money";

export interface ImportRow {
  line: number; // 1-based line in the input, for messages
  name: string | null;
  setCode: string | null;
  number: number | null;
  finish: "NORMAL" | "FOIL" | null; // null = not stated
  printing: string | null; // e.g. "Alternate art", "Signature"
  language: string | null;
  condition: string;
  quantity: number;
  unitPrice: number | null; // minor units; null = not given
  landedTotal: number | null; // our own lots export carries this
  currency: string | null;
  acquiredOn: string | null; // YYYY-MM-DD
  seller: string | null;
  storage: string | null;
  notes: string | null;
  errors: string[];
}

export const TEMPLATE_HEADERS = ["acquired_on", "seller", "set", "number", "name", "finish", "printing", "condition", "quantity", "currency", "unit_price", "storage", "notes"] as const;

export const TEMPLATE_CSV =
  "﻿" +
  [
    TEMPLATE_HEADERS.join(","),
    "2026-10-01,TCGplayer,OGN,202,Jinx - Rebel,Foil,,NM,1,USD,24.99,Binder A,",
    "2026-10-01,TCGplayer,UNL,,Mirror Image,,,NM,3,USD,0.75,,set and name are enough",
    "2026-10-05,Facebook group,,,Viktor - Leader,,,LP,1,THB,450.00,Deck box,name only: the base printing is used",
  ].join("\r\n") +
  "\r\n";

// Header aliases → field. Covers the template, our lots export, and common spreadsheet wording.
const ALIASES: Record<string, keyof ImportRow | "total"> = {
  name: "name", card: "name", card_name: "name", cardname: "name",
  set: "setCode", set_code: "setCode", setcode: "setCode", expansion: "setCode",
  number: "number", no: "number", collector_number: "number", card_number: "number", "#": "number",
  finish: "finish", foil: "finish",
  printing: "printing", art: "printing", variant: "printing",
  language: "language", lang: "language",
  condition: "condition", cond: "condition",
  quantity: "quantity", qty: "quantity", count: "quantity", amount: "quantity", remaining: "quantity",
  unit_price: "unitPrice", price: "unitPrice", price_each: "unitPrice", cost: "unitPrice", unit_cost: "unitPrice",
  landed_total: "landedTotal",
  currency: "currency", cur: "currency",
  acquired_on: "acquiredOn", date: "acquiredOn", bought_on: "acquiredOn", purchase_date: "acquiredOn", ordered_on: "acquiredOn",
  seller: "seller", source: "seller", bought_from: "seller", shop: "seller",
  storage: "storage", location: "storage", stored_in: "storage",
  notes: "notes", note: "notes", comment: "notes",
};

const CONDITIONS: Record<string, string> = { nm: "NM", "near mint": "NM", m: "NM", mint: "NM", lp: "LP", "lightly played": "LP", ex: "LP", mp: "MP", "moderately played": "MP", hp: "HP", "heavily played": "HP", dmg: "DMG", damaged: "DMG", d: "DMG" };
const CURRENCIES = ["THB", "USD", "EUR"];

const key = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, "_");

function normDate(v: string): string | null | "bad" {
  const t = v.trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/); // day/month/year (Thai and European order)
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "bad";
}

function finishOf(v: string): ImportRow["finish"] | "bad" {
  const t = v.trim().toLowerCase();
  if (!t) return null;
  if (["foil", "f", "yes", "y", "true", "1", "holo"].includes(t)) return "FOIL";
  if (["normal", "nonfoil", "non-foil", "non foil", "n", "no", "false", "0", "regular"].includes(t)) return "NORMAL";
  return "bad";
}

function blank(line: number): ImportRow {
  return { line, name: null, setCode: null, number: null, finish: null, printing: null, language: null, condition: "NM", quantity: 1, unitPrice: null, landedTotal: null, currency: null, acquiredOn: null, seller: null, storage: null, notes: null, errors: [] };
}

function looksLikeCsv(text: string): boolean {
  const first = (text.replace(/^﻿/, "").split(/\r?\n/).find((l) => l.trim()) ?? "").toLowerCase();
  const cells = first.split(/[,;\t]/).map(key);
  return cells.length > 1 && cells.some((c) => ALIASES[c] === "name" || ALIASES[c] === "number");
}

/** "3 Jinx - Rebel", "3x Jinx", "Jinx x3", "OGN-202 foil", "1 Ahri (OGN) 119" — one card per line. */
export function parseList(text: string): ImportRow[] {
  const out: ImportRow[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    let t = raw.trim();
    if (!t || t.startsWith("#") || t.startsWith("//") || /^[A-Za-z ]+:$/.test(t)) return; // blank, comment, section heading
    const r = blank(i + 1);
    let m = t.match(/^(\d+)\s*[x×]?\s+(.+)$/i);
    if (m) {
      r.quantity = Number(m[1]);
      t = m[2];
    } else if ((m = t.match(/^(.+?)\s+[x×](\d+)$/i))) {
      r.quantity = Number(m[2]);
      t = m[1];
    }
    if (/\s(\*?foil\*?|\(foil\))$/i.test(t)) {
      r.finish = "FOIL";
      t = t.replace(/\s(\*?foil\*?|\(foil\))$/i, "");
    }
    if ((m = t.match(/^([A-Z]{2,4})[-·\s]?(\d{1,3})[a-z]?$/))) {
      r.setCode = m[1];
      r.number = Number(m[2]);
    } else if ((m = t.match(/^(.+?)\s*\(([A-Z]{2,4})\)\s*(\d{1,3})?$/))) {
      r.name = m[1].trim();
      r.setCode = m[2];
      if (m[3]) r.number = Number(m[3]);
    } else r.name = t;
    if (!(r.quantity >= 1 && r.quantity <= 10_000)) r.errors.push("Quantity must be 1–10,000");
    out.push(r);
  });
  return out;
}

export function parseCsvRows(text: string): { rows: ImportRow[]; unknownColumns: string[] } {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], unknownColumns: [] };
  const header = table[0].map(key);
  const fields = header.map((h) => ALIASES[h] ?? null);
  const unknownColumns = table[0].filter((_, i) => !fields[i] && header[i] !== "type");
  const rows: ImportRow[] = [];
  table.slice(1).forEach((cells, idx) => {
    const r = blank(idx + 2);
    const get = (f: string) => {
      // our lots export has both quantity (bought) and remaining (still held): import what you hold
      const i = f === "quantity" && header.includes("remaining") ? header.indexOf("remaining") : fields.indexOf(f as never);
      return i >= 0 ? (cells[i] ?? "").trim() : "";
    };
    if (header.includes("type") && cells[header.indexOf("type")]?.trim().toLowerCase() !== "card" && cells[header.indexOf("type")]?.trim()) return; // our report CSV: skip sealed/TOTAL rows
    r.name = get("name") || null;
    r.setCode = get("setCode").toUpperCase() || null;
    const num = get("number").replace(/^0+(?=\d)/, "");
    if (num) {
      if (/^\d{1,4}[a-z]?$/i.test(num)) r.number = parseInt(num, 10);
      else r.errors.push(`Number "${num}" isn't a collector number`);
    }
    const f = finishOf(get("finish"));
    if (f === "bad") r.errors.push(`Finish "${get("finish")}" — use Normal or Foil`);
    else r.finish = f;
    r.printing = get("printing") || null;
    r.language = get("language").toUpperCase() || null;
    const c = get("condition");
    if (c) {
      const cc = CONDITIONS[c.toLowerCase()];
      if (cc) r.condition = cc;
      else r.errors.push(`Condition "${c}" — use NM, LP, MP, HP or DMG`);
    }
    const q = get("quantity");
    if (q) {
      const n = Number(q);
      if (Number.isInteger(n) && n >= 1 && n <= 10_000) r.quantity = n;
      else if (n === 0 && header.includes("remaining")) return; // fully sold lot in our export
      else r.errors.push(`Quantity "${q}" — whole number 1–10,000`);
    }
    const p = get("unitPrice").replace(/[฿$€\s]|THB|USD|EUR/gi, "");
    if (p) {
      const m = parseMoneyInput(p);
      if (m == null) r.errors.push(`Price "${get("unitPrice")}" — e.g. 12.50`);
      else r.unitPrice = m;
    }
    const lt = get("landedTotal");
    if (lt) r.landedTotal = parseMoneyInput(lt);
    const cur = get("currency").toUpperCase();
    if (cur) {
      if (CURRENCIES.includes(cur)) r.currency = cur;
      else r.errors.push(`Currency "${cur}" — THB, USD or EUR`);
    }
    const d = normDate(get("acquiredOn"));
    if (d === "bad") r.errors.push(`Date "${get("acquiredOn")}" — use YYYY-MM-DD`);
    else r.acquiredOn = d;
    r.seller = get("seller") || null;
    r.storage = get("storage") || null;
    r.notes = get("notes") || null;
    if (!r.name && !(r.setCode && r.number != null)) r.errors.push("Needs a card name, or set + number");
    rows.push(r);
  });
  return { rows, unknownColumns };
}

export function parseImportText(text: string): { kind: "csv" | "list"; rows: ImportRow[]; unknownColumns: string[] } {
  if (looksLikeCsv(text)) return { kind: "csv", ...parseCsvRows(text) };
  return { kind: "list", rows: parseList(text), unknownColumns: [] };
}
