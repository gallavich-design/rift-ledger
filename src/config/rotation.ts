// Standard rotation dates per set code. Synced onto Set.rotatesOn by the card sync.
// Source: Riot's published roadmap as summarised in the project brief — Sets 1–5 expected to
// leave Standard at the start of 2028.
// TODO verify: exact date and which set codes count as "Sets 1–5" against the official announcement.

export const ROTATION_DATES: Record<string, string> = {
  OGN: "2028-01-01", // TODO verify
  OGS: "2028-01-01", // TODO verify — Origins: Proving Grounds
  SFD: "2028-01-01", // TODO verify
  UNL: "2028-01-01", // TODO verify
  VEN: "2028-01-01", // TODO verify — assumed to be Set 4 (or 5)
};

/** Promo sets aren't a Standard product; their cards follow the card's main-set legality. TODO verify. */
export const NON_STANDARD_SET_CODES = new Set(["OPP", "PR", "JDG"]);
