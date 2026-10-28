import { describe, expect, it } from "vitest";
import { fitLayout, groupCards, palette, PAGE, type ImageCard } from "./deckImageLayout";
import { imageQuery, parseBackground, parseGrouping } from "./imageOptions";

const card = (cardId: string, section: ImageCard["section"], type: string, quantity: number, energy: number | null = null): ImageCard => ({ cardId, section, quantity, name: cardId, type, energy, domains: ["Calm"], imageUrl: null, landscape: false });
const deck: ImageCard[] = [
  card("legend", "LEGEND", "Legend", 1),
  card("champ", "CHAMPION", "Unit", 1, 4),
  card("calm", "RUNES", "Rune", 6),
  card("bf1", "BATTLEFIELDS", "Battlefield", 1),
  card("u-big", "MAIN", "Unit", 3, 7),
  card("u-small", "MAIN", "Unit", 3, 2),
  card("g", "MAIN", "Gear", 2, 2),
  card("s", "MAIN", "Spell", 3, 1),
  card("token", "MAIN", "Token", 1, 0),
  card("side", "SIDEBOARD", "Spell", 2, 3),
];

describe("deck image grouping", () => {
  it("deck order: legend, runes, battlefields, champion, then main by cost; sideboard last", () => {
    const g = groupCards(deck, "section");
    expect(g.map((x) => x.title)).toEqual([null, "Sideboard · 2"]);
    expect(g[0].cards.map((c) => c.cardId)).toEqual(["legend", "calm", "bf1", "champ", "token", "s", "g", "u-small", "u-big"]);
  });

  it("by card type: units, gear, spells (others last), each with its copies", () => {
    const g = groupCards(deck, "type");
    expect(g.map((x) => x.title)).toEqual([null, "Units · 6", "Gear · 2", "Spells · 3", "Other · 1", "Sideboard · 2"]);
    expect(g[1].cards.map((c) => c.cardId)).toEqual(["u-small", "u-big"]);
  });
});

describe("A4 fit", () => {
  it("uses the biggest cards that fit one page, and smaller ones for long lists", () => {
    const small = fitLayout(groupCards(deck, "section"));
    const many = Array.from({ length: 60 }, (_, i) => card(`c${i}`, "MAIN", "Unit", 1, i));
    const big = fitLayout(groupCards(many, "section"));
    expect(small.cols).toBeLessThan(big.cols);
    expect(big.height).toBeLessThanOrEqual(PAGE.height);
    expect(PAGE.width / PAGE.height).toBeCloseTo(210 / 297, 2); // A4
  });
});

describe("background", () => {
  it("accepts only #rrggbb and switches text to light on dark backgrounds", () => {
    expect(parseBackground("#0F1A2E")).toBe("#0f1a2e");
    expect(parseBackground("red")).toBe("#fbfaf7");
    expect(parseBackground(null)).toBe("#fbfaf7");
    expect(palette("#0f1a2e").dark).toBe(true);
    expect(palette("#fbfaf7").dark).toBe(false);
    expect(palette("#efe6d2").ink).toBe("#16181d");
  });

  it("builds the image URL query", () => {
    expect(imageQuery({ grouping: "section", background: "#fbfaf7" })).toBe("");
    expect(imageQuery({ grouping: "type", background: "#0F1A2E" })).toBe("?group=type&bg=%230f1a2e");
    expect(parseGrouping("type")).toBe("type");
    expect(parseGrouping("whatever")).toBe("section");
  });
});
