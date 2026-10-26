import { describe, expect, it } from "vitest";
import { toCsv, toText } from "./exportList";
import { parseDecklistText } from "./parse";

const lines = [
  { section: "LEGEND" as const, quantity: 1, name: "Card Hero - Legend" },
  { section: "MAIN" as const, quantity: 3, name: 'Card "Quoted", Name', setCode: "OGN", collectorNumber: 7, printing: "Standard Foil", unitPrice: "฿10.00" },
  { section: "RUNES" as const, quantity: 6, name: "Fury Rune" },
];

describe("deck export", () => {
  it("text export round-trips through the importer", () => {
    const parsed = parseDecklistText(toText("My deck", lines));
    expect(parsed.map((p) => [p.sectionHint, p.quantity, p.name])).toEqual([
      ["LEGEND", 1, "Card Hero - Legend"],
      ["MAIN", 3, 'Card "Quoted", Name'],
      ["RUNES", 6, "Fury Rune"],
    ]);
  });

  it("CSV escapes quotes and commas", () => {
    const csv = toCsv(lines);
    expect(csv.split("\n")[0]).toBe("section,quantity,name,set,number,printing,unit_price,proxies");
    expect(csv).toContain('Main deck,3,"Card ""Quoted"", Name",OGN,7,Standard Foil,฿10.00,0');
  });
});
