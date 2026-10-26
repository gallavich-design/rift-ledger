// Deck legality, driven entirely by src/config/gameRules.ts. Each rule produces its own specific,
// actionable message so a person can see exactly what to change.

import { GAME_RULES, type GameRules } from "@/config/gameRules";
import { defaultSection, isChampionUnit, isSignature, SECTION_LABEL, type DeckCardInfo, type DeckLine, type Section } from "./types";

export type RuleId =
  | "LEGEND"
  | "CHAMPION"
  | "MAIN_SIZE"
  | "COPY_LIMIT"
  | "SIGNATURE"
  | "RUNES"
  | "BATTLEFIELDS"
  | "SIDEBOARD"
  | "DOMAIN_IDENTITY"
  | "SECTION"
  | "BANNED"
  | "FORMAT";

export interface Issue {
  rule: RuleId;
  message: string;
  cardIds?: string[];
}

export interface ValidationResult {
  legal: boolean;
  issues: Issue[];
  counts: Record<Section, number>;
  identity: string[] | null;
}

export interface ValidateOptions {
  rules?: GameRules;
  today: string; // YYYY-MM-DD
  bannedNames?: Iterable<string>;
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export function validateDeck(lines: DeckLine[], info: Map<string, DeckCardInfo>, opts: ValidateOptions): ValidationResult {
  const R = opts.rules ?? GAME_RULES;
  const issues: Issue[] = [];
  const counts = { LEGEND: 0, CHAMPION: 0, MAIN: 0, RUNES: 0, BATTLEFIELDS: 0, SIDEBOARD: 0 } as Record<Section, number>;
  const active = lines.filter((l) => l.quantity > 0 && info.has(l.cardId));
  for (const l of active) counts[l.section] += l.quantity;
  const card = (l: DeckLine) => info.get(l.cardId)!;
  const inSection = (s: Section) => active.filter((l) => l.section === s);

  // ── Legend ──
  const legends = inSection("LEGEND");
  let legend: DeckCardInfo | null = null;
  if (counts.LEGEND === 0) issues.push({ rule: "LEGEND", message: "Add a Champion Legend — it sets your deck's domains." });
  else if (counts.LEGEND > R.legend.count)
    issues.push({ rule: "LEGEND", message: `Only ${R.legend.count} Legend is allowed — you have ${counts.LEGEND}.`, cardIds: legends.map((l) => l.cardId) });
  else if (card(legends[0]).type !== "Legend")
    issues.push({ rule: "LEGEND", message: `${card(legends[0]).name} isn't a Legend.`, cardIds: [legends[0].cardId] });
  else legend = card(legends[0]);

  const identity = legend ? [...legend.domains, ...R.domainIdentity.alwaysAllowed] : null;
  const identityText = legend ? list(legend.domains) : "";
  const legendTags = legend?.tags ?? [];
  const sharesTag = (c: DeckCardInfo) => c.tags.some((t) => legendTags.includes(t));

  // ── Chosen Champion ──
  const champs = inSection("CHAMPION");
  if (counts.CHAMPION === 0) {
    issues.push({
      rule: "CHAMPION",
      message: legend ? `Choose your Chosen Champion: a Champion unit tagged ${list(legendTags)}.` : "Choose your Chosen Champion (pick a Legend first).",
    });
  } else if (counts.CHAMPION > R.chosenChampion.count) {
    issues.push({ rule: "CHAMPION", message: `Only ${R.chosenChampion.count} Chosen Champion — you have ${counts.CHAMPION}. Move the extra copies to the main deck.`, cardIds: champs.map((l) => l.cardId) });
  } else {
    const c = card(champs[0]);
    if (!isChampionUnit(c)) issues.push({ rule: "CHAMPION", message: `${c.name} isn't a Champion unit, so it can't be your Chosen Champion.`, cardIds: [c.cardId] });
    else if (legend && !sharesTag(c))
      issues.push({ rule: "CHAMPION", message: `${c.name} doesn't match your Legend — the Chosen Champion needs the ${list(legendTags)} tag.`, cardIds: [c.cardId] });
  }

  // ── Main deck size (Chosen Champion counts toward it) ──
  const mainTotal = counts.MAIN + counts.CHAMPION;
  if (mainTotal < R.mainDeck.minSize)
    issues.push({ rule: "MAIN_SIZE", message: `Main deck has ${mainTotal} cards (with your Chosen Champion) — it needs at least ${R.mainDeck.minSize}. Add ${R.mainDeck.minSize - mainTotal}.` });
  else if (R.mainDeck.maxSize != null && mainTotal > R.mainDeck.maxSize)
    issues.push({ rule: "MAIN_SIZE", message: `Main deck has ${mainTotal} cards — the most allowed is ${R.mainDeck.maxSize}.` });

  // ── Copy limit by name across Chosen Champion + Main + Sideboard ──
  const byName = new Map<string, { n: number; ids: Set<string> }>();
  for (const l of active.filter((x) => x.section === "MAIN" || x.section === "CHAMPION" || x.section === "SIDEBOARD")) {
    const c = card(l);
    const e = byName.get(c.name) ?? { n: 0, ids: new Set<string>() };
    e.n += l.quantity;
    e.ids.add(c.cardId);
    byName.set(c.name, e);
  }
  for (const [name, e] of byName) {
    if (e.n > R.copyLimitByName)
      issues.push({ rule: "COPY_LIMIT", message: `${e.n} copies of ${name} across your Chosen Champion, main deck and sideboard — the limit is ${R.copyLimitByName}.`, cardIds: [...e.ids] });
  }

  // ── Signature cards ──
  const sigLines = active.filter((l) => (l.section === "MAIN" || l.section === "SIDEBOARD") && isSignature(card(l)));
  const sigTotal = sigLines.reduce((a, l) => a + l.quantity, 0);
  if (sigTotal > R.signatureCards.maxTotal)
    issues.push({ rule: "SIGNATURE", message: `${sigTotal} Signature cards — the limit is ${R.signatureCards.maxTotal} in total.`, cardIds: sigLines.map((l) => l.cardId) });
  if (legend) {
    for (const l of sigLines) {
      const c = card(l);
      if (!sharesTag(c)) issues.push({ rule: "SIGNATURE", message: `${c.name} is a Signature card for ${list(c.tags)}; your Legend is ${list(legendTags)}.`, cardIds: [c.cardId] });
    }
  }

  // ── Rune deck ──
  if (counts.RUNES !== R.runeDeck.size) {
    const d = R.runeDeck.size - counts.RUNES;
    issues.push({ rule: "RUNES", message: `Rune deck has ${plural(counts.RUNES, "rune")} — it needs exactly ${R.runeDeck.size}. ${d > 0 ? `Add ${d}.` : `Remove ${-d}.`}` });
  }
  if (identity) {
    for (const l of inSection("RUNES")) {
      const c = card(l);
      if (c.type === "Rune" && !c.domains.every((d) => identity.includes(d)))
        issues.push({ rule: "RUNES", message: `${c.name} is outside your Legend's domains (${identityText}).`, cardIds: [c.cardId] });
    }
  }

  // ── Battlefields ──
  if (counts.BATTLEFIELDS !== R.battlefields.count)
    issues.push({ rule: "BATTLEFIELDS", message: `${plural(counts.BATTLEFIELDS, "battlefield")} — you need exactly ${R.battlefields.count}.` });
  if (R.battlefields.unique) {
    for (const l of inSection("BATTLEFIELDS")) {
      if (l.quantity > 1) issues.push({ rule: "BATTLEFIELDS", message: `${l.quantity} copies of ${card(l).name} — each battlefield must be different.`, cardIds: [l.cardId] });
    }
  }

  // ── Sideboard ──
  if (!R.sideboard.allowedSizes.includes(counts.SIDEBOARD))
    issues.push({ rule: "SIDEBOARD", message: `Sideboard has ${plural(counts.SIDEBOARD, "card")} — it must be ${R.sideboard.allowedSizes.join(" or ")}.` });

  // ── Right card type in each section ──
  for (const l of active) {
    const c = card(l);
    const home = defaultSection(c);
    if (l.section === "LEGEND" || l.section === "CHAMPION") continue; // covered above
    const okInSideboard = l.section === "SIDEBOARD" && home === "MAIN";
    if (home !== l.section && !okInSideboard)
      issues.push({ rule: "SECTION", message: `${c.name} is a ${c.type} — it belongs in the ${SECTION_LABEL[home].toLowerCase()}, not the ${SECTION_LABEL[l.section].toLowerCase()}.`, cardIds: [c.cardId] });
  }

  // ── Domain identity ──
  if (identity) {
    for (const l of active) {
      if (l.section === "LEGEND" || l.section === "RUNES") continue;
      const c = card(l);
      const outside = c.domains.filter((d) => !identity.includes(d));
      if (outside.length) issues.push({ rule: "DOMAIN_IDENTITY", message: `${c.name} (${list(c.domains)}) is outside your Legend's domains (${identityText}).`, cardIds: [c.cardId] });
    }
  }

  // ── Banned / format ──
  const banned = new Set([...R.bannedCardNames, ...(opts.bannedNames ?? [])]);
  const seen = new Set<string>();
  for (const l of active) {
    const c = card(l);
    if (seen.has(c.cardId)) continue;
    seen.add(c.cardId);
    if (banned.has(c.name)) issues.push({ rule: "BANNED", message: `${c.name} is banned.`, cardIds: [c.cardId] });
    if (!c.standardLegal) issues.push({ rule: "FORMAT", message: `${c.name} isn't from a Standard-legal set.`, cardIds: [c.cardId] });
    else if (c.rotatesOn && c.rotatesOn <= opts.today) issues.push({ rule: "FORMAT", message: `${c.name} rotated out of Standard on ${c.rotatesOn}.`, cardIds: [c.cardId] });
  }

  return { legal: issues.length === 0, issues, counts, identity };
}
