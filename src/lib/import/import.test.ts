import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv } from "./csv";
import { parseCsvRows, parseImportText, parseList, TEMPLATE_CSV } from "./rows";

describe("CSV reader", () => {
  it("handles quotes, escaped quotes, CRLF, BOM and blank lines", () => {
    const t = '﻿name,notes\r\n"Jinx, Loose Cannon","said ""hi"""\r\n\r\nViktor,\n';
    expect(parseCsv(t)).toEqual([
      ["name", "notes"],
      ["Jinx, Loose Cannon", 'said "hi"'],
      ["Viktor", ""],
    ]);
  });
  it("detects semicolon and tab files", () => {
    expect(detectDelimiter("name;qty\nA;1")).toBe(";");
    expect(detectDelimiter("name\tqty")).toBe("\t");
    expect(parseCsv("name;qty\nA;2")).toEqual([["name", "qty"], ["A", "2"]]);
  });
});

describe("import rows", () => {
  it("reads the template", () => {
    const { rows, unknownColumns } = parseCsvRows(TEMPLATE_CSV);
    expect(unknownColumns).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ setCode: "OGN", number: 202, name: "Jinx - Rebel", finish: "FOIL", quantity: 1, currency: "USD", unitPrice: 2499, acquiredOn: "2026-10-01", seller: "TCGplayer", storage: "Binder A", errors: [] });
    expect(rows[2]).toMatchObject({ name: "Viktor - Leader", condition: "LP", unitPrice: 45000, currency: "THB" });
  });

  it("accepts spreadsheet wording, money symbols and day/month/year dates", () => {
    const { rows } = parseCsvRows("Card Name,Qty,Price,Date,Foil\nAhri,2,฿1,250.00,05/10/2026,yes\n".replace("฿1,250.00", '"฿1,250.00"'));
    expect(rows[0]).toMatchObject({ name: "Ahri", quantity: 2, unitPrice: 125000, acquiredOn: "2026-10-05", finish: "FOIL", errors: [] });
  });

  it("flags bad values instead of guessing", () => {
    const { rows } = parseCsvRows("name,quantity,condition,currency,date,finish\nX,0,mint-ish,GBP,yesterday,sparkly\n,1,NM,USD,2026-01-01,\n");
    expect(rows[0].errors).toHaveLength(5);
    expect(rows[1].errors).toEqual(["Needs a card name, or set + number"]);
  });

  it("imports what you still hold from a Rift Ledger lots export", () => {
    const csv = "acquired_on,set,number,name,printing,finish,language,graded,condition,quantity,remaining,currency,unit_price,landed_total,source,storage,notes\n2026-10-01,OGN,202,Jinx - Rebel,Standard,FOIL,EN,,NM,3,2,USD,10.00,3150,Order: X,,\n2026-10-01,OGN,1,Sold Card,Standard,NORMAL,EN,,NM,1,0,USD,1.00,100,,,\n";
    const { rows } = parseCsvRows(csv);
    expect(rows).toHaveLength(1); // fully sold lot skipped
    expect(rows[0]).toMatchObject({ quantity: 2, landedTotal: 315000, unitPrice: 1000 });
  });

  it("reads plain lists", () => {
    const rows = parseList("Main deck:\n3 Jinx - Rebel\n2x Mirror Image\nViktor x4\nOGN-202 foil\n1 Ahri - Alluring (PR) 66\n# comment\n");
    expect(rows.map((r) => [r.quantity, r.name, r.setCode, r.number, r.finish])).toEqual([
      [3, "Jinx - Rebel", null, null, null],
      [2, "Mirror Image", null, null, null],
      [4, "Viktor", null, null, null],
      [1, null, "OGN", 202, "FOIL"],
      [1, "Ahri - Alluring", "PR", 66, null],
    ]);
  });

  it("tells CSV from a list", () => {
    expect(parseImportText("name,qty\nA,1").kind).toBe("csv");
    expect(parseImportText("3 Jinx, Loose Cannon").kind).toBe("list");
  });
});
