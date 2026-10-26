import { describe, expect, it } from "vitest";
import type { ProviderPrinting } from "@/lib/providers/types";
import { artOf, baseName, cardKey, groupPrintings, pipeJoin, pipeSplit } from "./grouping";
import { buildIndex, rankSearch, type SearchDoc } from "./search";
import { normalizeForSearch } from "./grouping";

const p = (over: Partial<ProviderPrinting>): ProviderPrinting => ({
  sourceId: Math.random().toString(36).slice(2),
  name: "Card A",
  riftboundId: null,
  tcgplayerId: null,
  collectorNumber: 1,
  energy: 1,
  might: 1,
  power: 0,
  type: "Unit",
  supertype: null,
  rarity: "Common",
  domains: ["Fury"],
  textPlain: "text",
  textRich: "<p>text</p>",
  flavour: null,
  setCode: "SET1",
  imageUrl: null,
  artist: null,
  tags: [],
  orientation: "portrait",
  flags: { alternateArt: false, overnumbered: false, signature: false },
  ...over,
});

describe("printing names", () => {
  it("strips known printing suffixes only", () => {
    expect(baseName("Card A (Alternate Art)")).toBe("Card A");
    expect(baseName("Card A (Signature)")).toBe("Card A");
    expect(baseName("Sprite (274) // Buff")).toBe("Sprite (274) // Buff");
  });

  it("groups comma and dash spellings of the same card", () => {
    expect(cardKey(p({ name: "Card A, Hero" }))).toBe(cardKey(p({ name: "Card A - Hero" })));
  });

  it("keeps same-named cards of different types apart", () => {
    expect(cardKey(p({ type: "Unit" }))).not.toBe(cardKey(p({ type: "Spell" })));
  });
});

describe("variant art", () => {
  it("maps upstream flags and promo sets", () => {
    expect(artOf(p({ flags: { alternateArt: false, overnumbered: false, signature: true } }))).toBe("SIGNATURE");
    expect(artOf(p({ flags: { alternateArt: false, overnumbered: true, signature: false } }))).toBe("OVERNUMBERED");
    expect(artOf(p({ flags: { alternateArt: true, overnumbered: false, signature: false } }))).toBe("ALTERNATE");
    expect(artOf(p({ name: "Card A (Metal)" }))).toBe("METAL");
    expect(artOf(p({ setCode: "OPP" }))).toBe("PROMO");
    expect(artOf(p({}))).toBe("STANDARD");
  });
});

describe("groupPrintings", () => {
  const dates = new Map<string, Date | null>([
    ["OLD", new Date("2025-01-01")],
    ["NEW", new Date("2026-01-01")],
  ]);

  it("makes one card per game card with every printing as a variant", () => {
    const groups = groupPrintings(
      [
        p({ name: "Card A - Hero", setCode: "NEW" }),
        p({ name: "Card A - Hero (Alternate Art)", setCode: "NEW", flags: { alternateArt: true, overnumbered: false, signature: false } }),
        p({ name: "Card A, Hero", setCode: "OLD" }),
        p({ name: "Card B" }),
      ],
      dates,
    );
    expect(groups).toHaveLength(2);
    const a = groups.find((g) => g.name === "Card A - Hero")!;
    expect(a.printings).toHaveLength(3);
    expect(a.base.setCode).toBe("OLD"); // earliest standard printing is the base
  });

  it("prefers the standard printing's (fuller) rules text over an alternate art", () => {
    const [g] = groupPrintings(
      [
        p({ name: "Card C (Alternate Art)", textPlain: "short", flags: { alternateArt: true, overnumbered: false, signature: false } }),
        p({ name: "Card C", textPlain: "short (with reminder text)" }),
      ],
      dates,
    );
    expect(g.base.textPlain).toBe("short (with reminder text)");
  });
});

describe("pipe lists", () => {
  it("round-trips", () => {
    expect(pipeSplit(pipeJoin(["Fury", "Order"]))).toEqual(["Fury", "Order"]);
    expect(pipeJoin([])).toBe("");
  });
});

describe("search ranking", () => {
  const doc = (name: string): SearchDoc => ({
    id: name,
    name,
    searchName: normalizeForSearch(name),
    type: "Unit",
    supertype: null,
    domains: "",
    tags: "",
    imageUrl: null,
    setCode: "X",
  });
  const idx = buildIndex(
    [
      "Master Yi - Honed",
      "Master Yi - Wuju Master",
      "Jinx - Loose Cannon",
      "Vi - Piltover Enforcer",
      "Yasuo - Unforgiven",
      "Dominus",
      "Windsinger",
      "Hexdrinker",
      "Draven - Showboat",
      "Card D",
    ].map(doc),
  );

  it.each([
    ["yi honed", "Master Yi - Honed"],
    ["mastr yi honned", "Master Yi - Honed"],
    ["jinks loose canon", "Jinx - Loose Cannon"],
    ["piltover enforcr", "Vi - Piltover Enforcer"],
    ["yasou", "Yasuo - Unforgiven"],
    ["jinks", "Jinx - Loose Cannon"],
    ["draven showbot", "Draven - Showboat"],
  ])("finds %s in top 3", (q, expected) => {
    const top3 = rankSearch(idx, q, 3).map((d) => d.name);
    expect(top3).toContain(expected);
  });
});

describe("osaDistance", () => {
  it("counts a transposition as one edit", async () => {
    const { osaDistance } = await import("./search");
    expect(osaDistance("yasou", "yasuo")).toBe(1);
    expect(osaDistance("jinks", "jinx")).toBe(2);
    expect(osaDistance("", "abc")).toBe(3);
  });
});

describe("search precision", () => {
  it("returns nothing for gibberish", () => {
    const idx = buildIndex(["Master Yi - Honed", "Jinx - Loose Cannon"].map((name) => ({
      id: name, name, searchName: normalizeForSearch(name), type: "Unit", supertype: null, domains: "", tags: "", imageUrl: null, setCode: "X",
    })));
    expect(rankSearch(idx, "qqqzzz")).toEqual([]);
  });
});
