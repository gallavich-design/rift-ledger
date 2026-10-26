import { describe, expect, it } from "vitest";
import { GAME_RULES } from "@/config/gameRules";
import { buildIndex, type SearchDoc } from "@/lib/catalog/search";
import { normalizeForSearch } from "@/lib/catalog/grouping";
import { costDeck, type CardPricing } from "./cost";
import { diffSnapshots, formatDiff } from "./diff";
import { parseDecklistText, sectionFromHeader } from "./parse";
import { resolveDecklist } from "./resolve";
import { deckStats } from "./stats";
import type { DeckCardInfo, DeckLine } from "./types";
import { validateDeck, type RuleId } from "./validate";
import { winRates } from "./winrate";

// ───────────────────────────── fixture: a legal Fury/Order "Card Hero" deck ─────────────────────────────

const info = new Map<string, DeckCardInfo>();
const add = (c: Partial<DeckCardInfo> & { cardId: string; name: string; type: string }) =>
  info.set(c.cardId, { supertype: null, domains: ["Fury"], tags: [], energy: 2, standardLegal: true, rotatesOn: null, ...c });

add({ cardId: "legend", name: "Card Hero - Legend", type: "Legend", domains: ["Fury", "Order"], tags: ["Card Hero"], energy: null });
add({ cardId: "champ", name: "Card Hero - Champion", type: "Unit", supertype: "Champion", domains: ["Fury"], tags: ["Card Hero", "Town"], energy: 4 });
add({ cardId: "otherChamp", name: "Card Villain - Champion", type: "Unit", supertype: "Champion", domains: ["Fury"], tags: ["Card Villain"] });
for (let i = 1; i <= 13; i++) add({ cardId: `m${i}`, name: `Card M${i}`, type: i % 4 === 0 ? "Spell" : "Unit", domains: [i % 2 ? "Fury" : "Order"], energy: i % 8 });
add({ cardId: "colorless", name: "Card Colorless Gear", type: "Gear", domains: ["Colorless"] });
add({ cardId: "mind", name: "Card Mind Spell", type: "Spell", domains: ["Mind"] });
add({ cardId: "furyMind", name: "Card Fury-Mind Unit", type: "Unit", domains: ["Fury", "Mind"] });
add({ cardId: "sig", name: "Card Hero Signature", type: "Spell", supertype: "Signature", domains: ["Fury", "Order"], tags: ["Card Hero"] });
add({ cardId: "sigOther", name: "Card Villain Signature", type: "Spell", supertype: "Signature", domains: ["Fury"], tags: ["Card Villain"] });
add({ cardId: "runeF", name: "Fury Rune", type: "Rune", supertype: "Basic", domains: ["Fury"], energy: null });
add({ cardId: "runeO", name: "Order Rune", type: "Rune", supertype: "Basic", domains: ["Order"], energy: null });
add({ cardId: "runeM", name: "Mind Rune", type: "Rune", supertype: "Basic", domains: ["Mind"], energy: null });
for (let i = 1; i <= 4; i++) add({ cardId: `bf${i}`, name: `Card Battlefield ${i}`, type: "Battlefield", domains: ["Colorless"], energy: null });
add({ cardId: "rotated", name: "Card Old", type: "Unit", domains: ["Fury"], rotatesOn: "2026-01-01" });
add({ cardId: "promoOnly", name: "Card Promo", type: "Unit", domains: ["Fury"], standardLegal: false });

const legalDeck = (): DeckLine[] => [
  { cardId: "legend", section: "LEGEND", quantity: 1, proxyQuantity: 0 },
  { cardId: "champ", section: "CHAMPION", quantity: 1, proxyQuantity: 0 },
  ...Array.from({ length: 13 }, (_, i) => ({ cardId: `m${i + 1}`, section: "MAIN" as const, quantity: 3, proxyQuantity: 0 })),
  { cardId: "runeF", section: "RUNES", quantity: 6, proxyQuantity: 0 },
  { cardId: "runeO", section: "RUNES", quantity: 6, proxyQuantity: 0 },
  { cardId: "bf1", section: "BATTLEFIELDS", quantity: 1, proxyQuantity: 0 },
  { cardId: "bf2", section: "BATTLEFIELDS", quantity: 1, proxyQuantity: 0 },
  { cardId: "bf3", section: "BATTLEFIELDS", quantity: 1, proxyQuantity: 0 },
];
const TODAY = "2026-10-26";
const check = (lines: DeckLine[], bannedNames: string[] = []) => validateDeck(lines, info, { today: TODAY, bannedNames });
const rulesOf = (lines: DeckLine[], banned?: string[]) => new Set(check(lines, banned).issues.map((i) => i.rule));
const set = (lines: DeckLine[], cardId: string, section: DeckLine["section"], quantity: number) => {
  const l = lines.find((x) => x.cardId === cardId && x.section === section);
  if (l) l.quantity = quantity;
  else lines.push({ cardId, section, quantity, proxyQuantity: 0 });
  return lines;
};

describe("legality validator (driven by gameRules.ts)", () => {
  it("passes the legal fixture deck", () => {
    const r = check(legalDeck());
    expect(r.issues).toEqual([]);
    expect(r.legal).toBe(true);
    expect(r.counts.MAIN + r.counts.CHAMPION).toBe(GAME_RULES.mainDeck.minSize);
  });

  // Each case breaks exactly one rule, checks the specific message, then fixes it and checks it clears.
  const cases: { rule: RuleId; name: string; breakIt: (l: DeckLine[]) => DeckLine[]; message: RegExp }[] = [
    { rule: "LEGEND", name: "no legend", breakIt: (l) => l.filter((x) => x.section !== "LEGEND"), message: /Add a Champion Legend/ },
    { rule: "LEGEND", name: "two legends", breakIt: (l) => set(l, "legend", "LEGEND", 2), message: /Only 1 Legend is allowed — you have 2/ },
    { rule: "CHAMPION", name: "no chosen champion", breakIt: (l) => set(l.filter((x) => x.section !== "CHAMPION"), "m1", "MAIN", 3), message: /Choose your Chosen Champion: a Champion unit tagged Card Hero/ },
    { rule: "CHAMPION", name: "champion with the wrong tag", breakIt: (l) => l.map((x) => (x.section === "CHAMPION" ? { ...x, cardId: "otherChamp" } : x)), message: /doesn't match your Legend — the Chosen Champion needs the Card Hero tag/ },
    { rule: "MAIN_SIZE", name: "main deck too small", breakIt: (l) => set(l, "m1", "MAIN", 1), message: /Main deck has 38 cards .* at least 40\. Add 2\./ },
    { rule: "COPY_LIMIT", name: "four copies", breakIt: (l) => set(l, "m1", "MAIN", 4), message: /4 copies of Card M1 .* limit is 3/ },
    { rule: "COPY_LIMIT", name: "champion + 3 in main", breakIt: (l) => set(set(l, "champ", "MAIN", 3), "m1", "MAIN", 0), message: /4 copies of Card Hero - Champion/ },
    { rule: "SIGNATURE", name: "four signature cards", breakIt: (l) => set(set(l, "m1", "MAIN", 0), "sig", "MAIN", 3).concat([{ cardId: "sig", section: "SIDEBOARD", quantity: 1, proxyQuantity: 0 }, ...["m2", "m3", "m4", "m5", "m6", "m7", "m8"].map((cardId) => ({ cardId, section: "SIDEBOARD" as const, quantity: 1, proxyQuantity: 0 }))]), message: /4 Signature cards — the limit is 3/ },
    { rule: "SIGNATURE", name: "another champion's signature", breakIt: (l) => set(set(l, "m1", "MAIN", 2), "sigOther", "MAIN", 1), message: /Card Villain Signature is a Signature card for Card Villain; your Legend is Card Hero/ },
    { rule: "RUNES", name: "eleven runes", breakIt: (l) => set(l, "runeF", "RUNES", 5), message: /Rune deck has 11 runes — it needs exactly 12\. Add 1\./ },
    { rule: "RUNES", name: "off-identity rune", breakIt: (l) => set(set(l, "runeF", "RUNES", 5), "runeM", "RUNES", 1), message: /Mind Rune is outside your Legend's domains \(Fury and Order\)/ },
    { rule: "BATTLEFIELDS", name: "two battlefields", breakIt: (l) => l.filter((x) => x.cardId !== "bf3"), message: /2 battlefields — you need exactly 3/ },
    { rule: "BATTLEFIELDS", name: "duplicate battlefield", breakIt: (l) => set(l.filter((x) => x.cardId !== "bf3"), "bf2", "BATTLEFIELDS", 2), message: /2 copies of Card Battlefield 2 — each battlefield must be different/ },
    { rule: "SIDEBOARD", name: "five-card sideboard", breakIt: (l) => l.concat(["m1", "m2", "m3", "m4", "m5"].map((cardId) => ({ cardId: cardId === "m1" ? "colorless" : cardId, section: "SIDEBOARD" as const, quantity: 1, proxyQuantity: 0 }))), message: /Sideboard has 5 cards — it must be 0 or 8/ },
    { rule: "DOMAIN_IDENTITY", name: "mind card in a fury/order deck", breakIt: (l) => set(set(l, "m1", "MAIN", 2), "mind", "MAIN", 1), message: /Card Mind Spell \(Mind\) is outside your Legend's domains \(Fury and Order\)/ },
    { rule: "DOMAIN_IDENTITY", name: "multi-domain card needs every domain", breakIt: (l) => set(set(l, "m1", "MAIN", 2), "furyMind", "MAIN", 1), message: /Card Fury-Mind Unit \(Fury and Mind\) is outside/ },
    { rule: "SECTION", name: "rune in the main deck", breakIt: (l) => set(set(l, "m1", "MAIN", 2), "runeF", "MAIN", 1), message: /Fury Rune is a Rune — it belongs in the rune deck, not the main deck/ },
    { rule: "FORMAT", name: "rotated card", breakIt: (l) => set(set(l, "m1", "MAIN", 2), "rotated", "MAIN", 1), message: /Card Old rotated out of Standard on 2026-01-01/ },
    { rule: "FORMAT", name: "non-Standard set", breakIt: (l) => set(set(l, "m1", "MAIN", 2), "promoOnly", "MAIN", 1), message: /Card Promo isn't from a Standard-legal set/ },
  ];

  it.each(cases)("$rule: $name → specific error, fixing clears it", ({ rule, breakIt, message }) => {
    const broken = check(breakIt(legalDeck()));
    expect(broken.legal).toBe(false);
    const issue = broken.issues.find((i) => i.rule === rule);
    expect(issue?.message).toMatch(message);
    expect(rulesOf(legalDeck()).has(rule)).toBe(false);
  });

  it("BANNED: a banned card is flagged and clears when unbanned", () => {
    expect(check(legalDeck(), ["Card M1"]).issues.find((i) => i.rule === "BANNED")?.message).toBe("Card M1 is banned.");
    expect(rulesOf(legalDeck(), [])).not.toContain("BANNED");
  });

  it("colorless cards fit any identity", () => {
    expect(rulesOf(set(set(legalDeck(), "m1", "MAIN", 2), "colorless", "MAIN", 1)).size).toBe(0);
  });

  it("an 8-card sideboard is legal and counts toward the copy limit", () => {
    const l = legalDeck().concat(["m1", "m2", "m3", "m4", "m5", "m6", "m7", "colorless"].map((cardId) => ({ cardId, section: "SIDEBOARD" as const, quantity: 1, proxyQuantity: 0 })));
    const r = check(l);
    expect(r.issues.map((i) => i.rule)).toEqual(Array(7).fill("COPY_LIMIT"));
  });

  it("every rule in gameRules.ts has at least one test above", () => {
    const tested = new Set([...cases.map((c) => c.rule), "BANNED"]);
    for (const r of ["LEGEND", "CHAMPION", "MAIN_SIZE", "COPY_LIMIT", "SIGNATURE", "RUNES", "BATTLEFIELDS", "SIDEBOARD", "DOMAIN_IDENTITY", "BANNED", "FORMAT"]) expect(tested.has(r)).toBe(true);
  });
});

// ───────────────────────────── cost ─────────────────────────────

const priced = (cardId: string, variants: [string, number | null][], defaultVariantId = variants[0][0]): [string, CardPricing] => [
  cardId,
  { cardId, defaultVariantId, variants: variants.map(([variantId, unit]) => ({ variantId, label: variantId, unit })) },
];

describe("Example D — deck cost to complete", () => {
  const lines: DeckLine[] = [
    { cardId: "P", section: "MAIN", quantity: 3, proxyQuantity: 0 },
    { cardId: "Q", section: "MAIN", quantity: 2, proxyQuantity: 0 },
    { cardId: "R", section: "MAIN", quantity: 3, proxyQuantity: 1 },
    { cardId: "S", section: "MAIN", quantity: 4, proxyQuantity: 0 }, // "all other cards owned"
  ];
  const owned = new Map([
    ["P", 1],
    ["Q", 0],
    ["R", 3],
    ["S", 4],
  ]);
  const pricing = new Map([priced("P", [["p", 1200]]), priced("Q", [["q", 3000]]), priced("R", [["r", 200]]), priced("S", [["s", 500]])]);
  const c = costDeck(lines, owned, pricing);

  it("costs $86.00 to complete", () => {
    expect(c.costToComplete).toBe(8600);
    expect(Object.fromEntries(c.lines.map((l) => [l.cardId, l.missing]))).toEqual({ P: 2, Q: 2, R: 1, S: 0 });
  });

  it("counts the proxied copy as missing for cost, and the deck stays legal", () => {
    const r = c.lines.find((l) => l.cardId === "R")!;
    expect(r).toMatchObject({ owned: 2, proxies: 1, missingCost: 200 });
    // legality counts quantity (proxies included): a proxy line still satisfies rune/size rules
    const legal = legalDeck().map((l) => (l.cardId === "m1" ? { ...l, proxyQuantity: 2 } : l));
    expect(check(legal).legal).toBe(true);
  });
});

describe("budget build", () => {
  const lines: DeckLine[] = [
    { cardId: "A", section: "MAIN", quantity: 2, proxyQuantity: 0, preferredVariantId: "a-alt" },
    { cardId: "B", section: "MAIN", quantity: 3, proxyQuantity: 0 },
    { cardId: "C", section: "MAIN", quantity: 1, proxyQuantity: 0 },
  ];
  const pricing = new Map([
    priced("A", [["a-std", 500], ["a-alt", 4000], ["a-foil", 900]], "a-std"),
    priced("B", [["b-std", 100], ["b-foil", 300]]),
    priced("C", [["c-only", null]]),
  ]);
  const c = costDeck(lines, new Map(), pricing);

  it("is never more than the normal build", () => {
    expect(c.budgetValue).toBeLessThanOrEqual(c.value);
    expect(c.budgetCostToComplete).toBeLessThanOrEqual(c.costToComplete);
  });

  it("lists each swap with its saving", () => {
    expect(c.swaps).toEqual([{ cardId: "A", from: expect.objectContaining({ variantId: "a-alt" }), to: expect.objectContaining({ variantId: "a-std" }), quantity: 2, saving: 7000 }]);
    expect(c.value - c.budgetValue).toBe(7000);
  });

  it("reports cards with no price at all", () => {
    expect(c.unpriced).toEqual(["C"]);
  });

  it("shares owned copies across sections (Chosen Champion + main)", () => {
    const r = costDeck(
      [
        { cardId: "X", section: "CHAMPION", quantity: 1, proxyQuantity: 0 },
        { cardId: "X", section: "MAIN", quantity: 2, proxyQuantity: 0 },
      ],
      new Map([["X", 2]]),
      new Map([priced("X", [["x", 1000]])]),
    );
    expect(r.lines[0]).toMatchObject({ quantity: 3, owned: 2, missing: 1 });
    expect(r.costToComplete).toBe(1000);
  });
});

// ───────────────────────────── stats ─────────────────────────────

describe("deck stats", () => {
  it("builds the energy curve, type and domain splits from champion + main", () => {
    const s = deckStats(legalDeck(), info);
    expect(s.playables).toBe(40);
    expect(s.curve.reduce((a, b) => a + b.count, 0)).toBe(40);
    expect(s.curve.find((x) => x.energy === "4")!.count).toBe(1 + 3 + 3); // champion + m4 + m12
    expect(s.types.map((t) => t.key)).toEqual(["Unit", "Spell"]);
    expect(s.averageEnergy).toBeGreaterThan(0);
  });
});

// ───────────────────────────── import ─────────────────────────────

describe("decklist import", () => {
  it("recognises section headers in their common spellings", () => {
    expect(sectionFromHeader("Legend:")).toBe("LEGEND");
    expect(sectionFromHeader("Champion (1)")).toBe("CHAMPION");
    expect(sectionFromHeader("Main Deck: 39")).toBe("MAIN");
    expect(sectionFromHeader("# Runes")).toBe("RUNES");
    expect(sectionFromHeader("Rune Pool")).toBe("RUNES");
    expect(sectionFromHeader("Battlefields:")).toBe("BATTLEFIELDS");
    expect(sectionFromHeader("Sideboard")).toBe("SIDEBOARD");
    expect(sectionFromHeader("Jinx - Loose Cannon")).toBeNull();
  });

  it("parses quantity styles and strips set references", () => {
    const p = parseDecklistText("Main:\n3 Card A\n2x Card B\nCard C x3\nCard D (2)\nCard E\n1 Card F (OGN) 123\n\n// comment");
    expect(p.map((l) => [l.quantity, l.name, l.sectionHint])).toEqual([
      [3, "Card A", "MAIN"],
      [2, "Card B", "MAIN"],
      [3, "Card C", "MAIN"],
      [2, "Card D", "MAIN"],
      [1, "Card E", "MAIN"],
      [1, "Card F", "MAIN"],
    ]);
  });

  const docs: SearchDoc[] = [...info.values()].map((c) => ({
    id: c.cardId,
    name: c.name,
    searchName: normalizeForSearch(c.name),
    type: c.type,
    supertype: c.supertype,
    domains: `|${c.domains.join("|")}|`,
    tags: c.tags.length ? `|${c.tags.join("|")}|` : "",
    imageUrl: null,
    setCode: "X",
  }));
  const idx = buildIndex(docs);

  it("matches names, sorts by type, picks the Chosen Champion, and lists every unrecognised line", () => {
    const text = [
      "Legend:",
      "1 Card Hero - Legend",
      "Main deck:",
      "3 Card Hero - Champion",
      "3 Card M1",
      "2 Card M2",
      "3 Totally Unknown Card",
      "1 Fury Rune", // wrong section in the list — goes to runes by type
      "Battlefields:",
      "1 Card Battlefield 1",
      "1 Zzzz Qqqq",
    ].join("\n");
    const r = resolveDecklist(parseDecklistText(text), idx);
    const by = (s: string) => Object.fromEntries(r.lines.filter((l) => l.section === s).map((l) => [l.cardId, l.quantity]));
    expect(by("LEGEND")).toEqual({ legend: 1 });
    expect(by("CHAMPION")).toEqual({ champ: 1 });
    expect(by("MAIN")).toEqual({ champ: 2, m1: 3, m2: 2 });
    expect(by("RUNES")).toEqual({ runeF: 1 });
    expect(by("BATTLEFIELDS")).toEqual({ bf1: 1 });
    expect(r.unrecognized.map((u) => [u.lineNo, u.name, u.quantity])).toEqual([
      [7, "Totally Unknown Card", 3],
      [11, "Zzzz Qqqq", 1],
    ]);
  });

  it("accepts a confident typo but not an ambiguous one", () => {
    const r = resolveDecklist(parseDecklistText("1 Card Hero - Legnd\n2 Card M"), idx);
    expect(r.matched.map((m) => [m.name, m.fuzzy])).toEqual([["Card Hero - Legend", true]]);
    expect(r.unrecognized[0].name).toBe("Card M");
    expect(r.unrecognized[0].suggestions.length).toBeGreaterThan(0);
  });
});

// ───────────────────────────── versions & matches ─────────────────────────────

describe("version diff", () => {
  it("reports −2 X, +2 Y", () => {
    const prev = [
      { cardId: "x", name: "Card X", section: "MAIN" as const, quantity: 3, proxyQuantity: 0 },
      { cardId: "z", name: "Card Z", section: "MAIN" as const, quantity: 2, proxyQuantity: 0 },
    ];
    const next = [
      { cardId: "x", name: "Card X", section: "MAIN" as const, quantity: 1, proxyQuantity: 0 },
      { cardId: "y", name: "Card Y", section: "MAIN" as const, quantity: 2, proxyQuantity: 0 },
      { cardId: "z", name: "Card Z", section: "MAIN" as const, quantity: 2, proxyQuantity: 1 },
    ];
    expect(formatDiff(diffSnapshots(prev, next))).toBe("−2 Card X, +2 Card Y");
  });

  it("treats a move between sections as a removal and an addition", () => {
    const d = diffSnapshots(
      [{ cardId: "x", name: "Card X", section: "MAIN", quantity: 1, proxyQuantity: 0 }],
      [{ cardId: "x", name: "Card X", section: "SIDEBOARD", quantity: 1, proxyQuantity: 0 }],
    );
    expect(d.map((e) => [e.section, e.delta])).toEqual([
      ["MAIN", -1],
      ["SIDEBOARD", 1],
    ]);
  });
});

describe("match log", () => {
  it("win rate overall and by opponent legend", () => {
    const r = winRates([
      { opponentLegend: "Card Villain", result: "WIN" },
      { opponentLegend: "Card Villain", result: "LOSS" },
      { opponentLegend: "Card Villain", result: "WIN" },
      { opponentLegend: "Card Rival", result: "WIN" },
      { opponentLegend: "Card Rival", result: "DRAW" },
    ]);
    expect(r.overall).toMatchObject({ games: 5, wins: 3, losses: 1, draws: 1, winRate: 60 });
    expect(r.byOpponent).toEqual([
      expect.objectContaining({ opponentLegend: "Card Villain", games: 3, wins: 2 }),
      expect.objectContaining({ opponentLegend: "Card Rival", games: 2, wins: 1, winRate: 50 }),
    ]);
  });
});
