import { describe, expect, it } from "vitest";
import { normaliseName, parseNumber, splitCardType, tcgToPrinting, withTcgplayerFallback } from "./tcgplayerCards";
import { artOf, cardKey } from "@/lib/catalog/grouping";
import type { CardDataProvider } from "./types";

// Shapes copied from tcgcsv.com group 24819 (Radiance) on 2026-10-28.
const prod = (productId: number, name: string, ext: Record<string, string>) => ({ productId: String(productId), name, imageUrl: `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_200w.jpg`, ext: new Map(Object.entries(ext)) });
const kaisa = prod(721337, "Kai'Sa, Rebel", { Rarity: "Rare", Number: "063/167", "Card Type": "Champion Unit", Tag: "Kai'Sa;The Void", Domain: "Mind", "Energy Cost": "5", "Power Cost": "1", Might: "5", Description: "[DISARM] <em>(When I attack, give an enemy unit here -1 this turn).</em>\r\n<br>When I conquer, draw 1.", "Flavor Text": "<em>\"It's a good day for a hunt.\"</em>" });
const spell = prod(721335, "Rousing Display", { Rarity: "Uncommon", Number: "127/167", "Card Type": "Spell", Domain: "Order", "Energy Cost": "5", "Power Cost": "0", Might: "0", Description: "[SHOW OFF] a card." });

describe("TCGplayer card data → printings", () => {
  it("maps a champion unit like the card database does", () => {
    const p = tcgToPrinting(kaisa, "RAD");
    expect(p).toMatchObject({
      sourceId: "tcg:721337",
      tcgplayerId: "721337",
      name: "Kai'Sa - Rebel",
      type: "Unit",
      supertype: "Champion",
      collectorNumber: 63,
      energy: 5,
      power: 1,
      might: 5,
      domains: ["Mind"],
      tags: ["Kai'Sa", "The Void"],
      setCode: "RAD",
      imageUrl: "https://tcgplayer-cdn.tcgplayer.com/product/721337_400w.jpg",
      flavour: "\"It's a good day for a hunt.\"",
    });
    expect(p.textPlain).toBe("[DISARM] (When I attack, give an enemy unit here -1 this turn).\nWhen I conquer, draw 1.");
    expect(cardKey(p)).toBe(cardKey({ name: "Kai'Sa - Rebel", type: "Unit" })); // merges with a Riftcodex printing
    expect(artOf(p)).toBe("STANDARD");
  });

  it("drops TCGplayer's placeholder zeros on spells", () => {
    expect(tcgToPrinting(spell, "RAD")).toMatchObject({ type: "Spell", supertype: null, energy: 5, power: null, might: null });
  });

  it("reads printings from the name suffix and the collector number", () => {
    const sig = tcgToPrinting(prod(1, "Ekko, Boy Who Shattered Time (Signature)", { Number: "168*/167", "Card Type": "Legend", Rarity: "Showcase" }), "RAD");
    expect(sig).toMatchObject({ name: "Ekko - Boy Who Shattered Time (Signature)", collectorNumber: 168, energy: null });
    expect(artOf(sig)).toBe("SIGNATURE");
    expect(artOf(tcgToPrinting(prod(2, "Ekko, Boy Who Shattered Time (Overnumbered)", { Number: "168/167", "Card Type": "Legend" }), "RAD"))).toBe("OVERNUMBERED");
    expect(artOf(tcgToPrinting(prod(3, "Ziggs, Hexplosives Expert (Heartsteel Overnumbered)", { Number: "180/167", "Card Type": "Legend" }), "RAD"))).toBe("OVERNUMBERED");
    const alt = tcgToPrinting(prod(4, "Some Unit (Alternate Art)", { Number: "061a/167", "Card Type": "Unit" }), "RAD");
    expect(alt).toMatchObject({ name: "Some Unit (Alternate Art)", collectorNumber: 61 });
    expect(artOf(alt)).toBe("ALTERNATE");
    const rune = tcgToPrinting(prod(5, "Calm Rune (R02a)", { Number: "R02a", "Card Type": "Rune", Domain: "Calm" }), "RAD");
    expect(rune).toMatchObject({ name: "Calm Rune (Alternate Art)", type: "Rune", supertype: "Basic", collectorNumber: 2 });
    expect(cardKey(rune)).toBe(cardKey({ name: "Calm Rune", type: "Rune" }));
    expect(artOf(rune)).toBe("ALTERNATE");
    // Promo runes: "(R01b)", "(R01c)" and "(Vendetta)" are the same rune, printed as a promo.
    const promoB = tcgToPrinting(prod(7, "Fury Rune (R01b)", { Number: "R01b", "Card Type": "Rune", Domain: "Fury", Rarity: "Promo" }), "SFD");
    expect(promoB).toMatchObject({ name: "Fury Rune", printName: "Fury Rune (R01b)", collectorNumber: 1 });
    expect(artOf(promoB)).toBe("PROMO");
    const ven = tcgToPrinting(prod(8, "Body Rune (Vendetta)", { Number: "R04b", "Card Type": "Rune", Domain: "Body", Rarity: "Common" }), "OPP");
    expect(ven).toMatchObject({ name: "Body Rune", printName: "Body Rune (Vendetta)", collectorNumber: 4 });
    expect(tcgToPrinting(kaisa, "RAD").printName).toBeUndefined();
    expect(artOf(ven)).toBe("PROMO"); // OP promo set
    expect(artOf(tcgToPrinting(prod(9, "Order Rune (R06c)", { Number: "R06c", "Card Type": "Rune", Rarity: "Promo" }), "OPP"))).toBe("PROMO");
    const bf = tcgToPrinting(prod(6, "Cosmic Vista", { Number: "160/167", "Card Type": "Battlefield", Domain: "None" }), "RAD");
    expect(bf).toMatchObject({ domains: ["Colorless"], orientation: "landscape" });
  });

  it("splits types and numbers", () => {
    expect(splitCardType("Signature Gear")).toEqual({ type: "Gear", supertype: "Signature" });
    expect(parseNumber("176/167")).toEqual({ number: 176, denominator: 167, letter: false, star: false });
    expect(normaliseName("Unknown (Something Else)", "Unit")).toEqual({ base: "Unknown (Something Else)", suffix: null, kind: null });
  });
});

describe("fallback to TCGplayer for sets the card database lacks", () => {
  const primary: CardDataProvider = {
    id: "fake",
    getSets: async () => [{ sourceId: "x", code: "VEN", name: "Vendetta", cardCount: 1, releaseDate: null, tcgplayerId: null }],
    getCards: async () => [],
    searchCards: async () => [],
    getCard: async () => null,
  };
  const many = (n: number) => Array.from({ length: n }, (_, i) => prod(1000 + i, `Card ${i}`, { Number: `${String(i + 1).padStart(3, "0")}/167`, "Card Type": "Unit", Rarity: "Common" }));
  const groups = [
    { groupId: "24819", name: "Radiance", abbreviation: "RAD", publishedOn: new Date("2026-10-23T00:00:00Z") },
    { groupId: "24698", name: "Vendetta", abbreviation: "VEN", publishedOn: null }, // covered by code
    { groupId: "24861", name: "T1 2025 Worlds Champion Bundles", abbreviation: "T12025", publishedOn: null }, // too small
  ];
  const products: Record<string, ReturnType<typeof prod>[]> = { "24819": [...many(60), prod(9, "Radiance - Booster Pack", {})], "24698": many(60), "24861": many(15) };

  it("adds uncovered full sets only, with their printed size", async () => {
    const p = withTcgplayerFallback(primary, { fetchGroupsFn: async () => groups, fetchProductsFn: async (g) => products[g] });
    const sets = await p.getSets();
    expect(sets.map((s) => s.code)).toEqual(["VEN", "RAD"]);
    expect(sets[1]).toMatchObject({ name: "Radiance", cardCount: 167, tcgplayerId: "24819" });
    const cards = await p.getCards();
    expect(cards).toHaveLength(60); // sealed product skipped
    expect(cards.every((c) => c.setCode === "RAD")).toBe(true);
  });

  it("keeps working when TCGplayer is unreachable, and says so", async () => {
    const p = withTcgplayerFallback(primary, { fetchGroupsFn: async () => { throw new Error("down"); } });
    expect((await p.getSets()).map((s) => s.code)).toEqual(["VEN"]);
    expect(p.tcgplayerReachable()).toBe(false);
    expect(await p.getCards()).toEqual([]);
  });

  it("adds runes the card database lacks in sets it covers, and only those", async () => {
    const venRune = (id: number, name: string, num: string) => prod(id, name, { Number: num, "Card Type": "Rune", Rarity: "Common", Domain: "Fury" });
    const covering: CardDataProvider = {
      ...primary,
      // The card database already has the Vendetta Fury Rune (TCGplayer product 706028).
      getCards: async () => [{ ...tcgToPrinting(venRune(706028, "Fury Rune", "R01"), "VEN"), sourceId: "rc-fury" }],
    };
    const p = withTcgplayerFallback(covering, {
      fetchGroupsFn: async () => [groups[1]],
      fetchProductsFn: async () => [venRune(706028, "Fury Rune", "R01"), venRune(709312, "Fury Rune (R01a)", "R01a"), prod(1, "Some Unit", { Number: "001/221", "Card Type": "Unit" })],
    });
    const cards = await p.getCards();
    expect(cards.map((c) => c.sourceId)).toEqual(["rc-fury", "tcg:709312"]); // only the missing alt-art rune; units untouched
    expect(cards[1]).toMatchObject({ setCode: "VEN", name: "Fury Rune (Alternate Art)", collectorNumber: 1 });
    expect(p.tcgplayerReachable()).toBe(true);
  });
});
