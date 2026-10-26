// Every Riftbound deck-construction rule in one place (spec §0.3). The Phase 3 validator reads only this file.
// Values are from the brief's description of the official rules and are NOT yet checked
// against the current Riftbound Core Rules document. Each one is marked TODO verify.

export const GAME_RULES = {
  formats: ["STANDARD"] as const,

  legend: { count: 1 }, // TODO verify: exactly one Champion Legend
  chosenChampion: { count: 1 }, // TODO verify: one Champion unit matching the Legend's champion tag
  mainDeck: { minSize: 40, maxSize: null as number | null }, // TODO verify: 40-card minimum, chosen champion included
  copyLimitByName: 3, // TODO verify: max copies of the same card name across main deck + champion
  runeDeck: { size: 12 }, // TODO verify
  battlefields: { count: 3, unique: true }, // TODO verify
  sideboard: { maxSize: 8 }, // TODO verify: sideboard size for best-of-three events
  domainIdentity: {
    // TODO verify: every card's domains must be within the Legend's domains; Colorless is always allowed
    alwaysAllowed: ["Colorless"],
  },
  signatureCards: { maxTotal: 3 }, // TODO verify: signature cards must match the Legend's champion
} as const;

export type GameRules = typeof GAME_RULES;
