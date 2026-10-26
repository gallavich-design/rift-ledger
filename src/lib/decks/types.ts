export const SECTIONS = ["LEGEND", "CHAMPION", "MAIN", "RUNES", "BATTLEFIELDS", "SIDEBOARD"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABEL: Record<Section, string> = {
  LEGEND: "Legend",
  CHAMPION: "Chosen Champion",
  MAIN: "Main deck",
  RUNES: "Rune deck",
  BATTLEFIELDS: "Battlefields",
  SIDEBOARD: "Sideboard",
};

/** Catalogue facts the deck engine needs about a card. */
export interface DeckCardInfo {
  cardId: string;
  name: string;
  type: string; // Legend | Unit | Spell | Gear | Battlefield | Rune
  supertype: string | null; // Champion | Signature | Basic | Token
  domains: string[];
  tags: string[];
  energy: number | null;
  imageUrl?: string | null;
  standardLegal: boolean; // card's set is a Standard product
  rotatesOn: string | null; // YYYY-MM-DD, from the card's set
}

export interface DeckLine {
  cardId: string;
  section: Section;
  quantity: number;
  proxyQuantity: number; // copies that are proxies / borrowed — legal, but not owned
  preferredVariantId?: string | null;
}

/** Which section a card belongs in by type, when the list doesn't say. */
export function defaultSection(info: Pick<DeckCardInfo, "type">): Section {
  if (info.type === "Legend") return "LEGEND";
  if (info.type === "Rune") return "RUNES";
  if (info.type === "Battlefield") return "BATTLEFIELDS";
  return "MAIN";
}

export const isChampionUnit = (c: Pick<DeckCardInfo, "type" | "supertype">) => c.type === "Unit" && c.supertype === "Champion";
export const isSignature = (c: Pick<DeckCardInfo, "supertype">) => c.supertype === "Signature";
