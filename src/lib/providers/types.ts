// Provider interfaces (spec §2). Each external source implements one of these so it can be swapped.

export interface ProviderSet {
  sourceId: string;
  code: string;
  name: string;
  cardCount: number;
  releaseDate: Date | null;
  tcgplayerId: string | null;
}

/** One printing as delivered by a card-data source (Riftcodex returns one record per printing). */
export interface ProviderPrinting {
  sourceId: string;
  name: string; // full printing name incl. suffix, e.g. "Vi - Piltover Enforcer (Signature)"
  riftboundId: string | null;
  tcgplayerId: string | null;
  collectorNumber: number | null;
  energy: number | null;
  might: number | null;
  power: number | null;
  type: string;
  supertype: string | null;
  rarity: string | null;
  domains: string[];
  textPlain: string;
  textRich: string;
  flavour: string | null;
  setCode: string;
  imageUrl: string | null;
  artist: string | null;
  tags: string[];
  orientation: string;
  flags: { alternateArt: boolean; overnumbered: boolean; signature: boolean };
  /** Name to show for this printing when it differs from `name` (which groups printings into cards). */
  printName?: string;
}

export interface CardDataProvider {
  id: string;
  getSets(): Promise<ProviderSet[]>;
  getCards(setCode?: string): Promise<ProviderPrinting[]>;
  searchCards(query: string): Promise<ProviderPrinting[]>;
  getCard(id: string): Promise<ProviderPrinting | null>;
}

export interface PricePoint {
  variantId: string;
  source: string;
  market: number | null; // minor units
  low: number | null;
  mid: number | null;
  currency: string;
  capturedAt: Date;
}

export interface PriceProvider {
  id: string;
  getPrices(variantIds: string[]): Promise<PricePoint[]>;
}

export interface ImportedDeck {
  event: string;
  placement: string | null;
  playedOn: Date | null;
  archetype: string;
  lines: { name: string; quantity: number; section: string }[];
}

export interface DecklistProvider {
  id: string;
  getEventDecks(filters: { from?: Date; to?: Date; legend?: string }): Promise<ImportedDeck[]>;
}
