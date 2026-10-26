// Text export uses the same shape the importer reads, so an exported list round-trips.

import { SECTION_LABEL, SECTIONS, type Section } from "./types";

export interface ExportLine {
  section: Section;
  quantity: number;
  name: string;
  setCode?: string;
  collectorNumber?: number | null;
  printing?: string;
  unitPrice?: string;
  proxies?: number;
}

export function toText(deckName: string, lines: ExportLine[]): string {
  const out = [`// ${deckName}`];
  for (const s of SECTIONS) {
    const ls = lines.filter((l) => l.section === s).sort((a, b) => a.name.localeCompare(b.name));
    if (!ls.length) continue;
    out.push("", `${SECTION_LABEL[s]}:`);
    for (const l of ls) out.push(`${l.quantity} ${l.name}`);
  }
  return out.join("\n") + "\n";
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(lines: ExportLine[]): string {
  const head = ["section", "quantity", "name", "set", "number", "printing", "unit_price", "proxies"];
  const rows = SECTIONS.flatMap((s) =>
    lines
      .filter((l) => l.section === s)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((l) => [SECTION_LABEL[s], l.quantity, l.name, l.setCode ?? "", l.collectorNumber ?? "", l.printing ?? "", l.unitPrice ?? "", l.proxies ?? 0]),
  );
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
