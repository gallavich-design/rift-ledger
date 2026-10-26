// Allowed values for String columns in the Prisma schema (SQLite has no enums).

export const VARIANT_ARTS = ["STANDARD", "ALTERNATE", "OVERNUMBERED", "SIGNATURE", "PROMO", "METAL"] as const;
export type VariantArt = (typeof VARIANT_ARTS)[number];

export const FINISHES = ["NORMAL", "FOIL"] as const;
export type Finish = (typeof FINISHES)[number];

export const GRADING_COMPANIES = ["PSA", "BGS", "CGC", "OTHER"] as const;

export const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const STORAGE_TYPES = ["BINDER", "DECK_BOX", "BULK_BOX", "TOPLOADER", "GRADED_CASE", "OTHER"] as const;
export type StorageType = (typeof STORAGE_TYPES)[number];
export const STORAGE_TYPE_LABEL: Record<StorageType, string> = {
  BINDER: "Binder",
  DECK_BOX: "Deck box",
  BULK_BOX: "Bulk box",
  TOPLOADER: "Toploaders",
  GRADED_CASE: "Graded case",
  OTHER: "Other",
};

export const ART_LABEL: Record<VariantArt, string> = {
  STANDARD: "Standard",
  ALTERNATE: "Alternate art",
  OVERNUMBERED: "Overnumbered",
  SIGNATURE: "Signature",
  PROMO: "Promo",
  METAL: "Metal",
};

export const PRICE_SOURCES = ["TCGPLAYER", "LOCAL", "CARDMARKET", "MANUAL"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const CURRENCIES = ["THB", "USD", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];
