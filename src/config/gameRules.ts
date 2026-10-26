// Every Riftbound deck-construction rule in one place (spec §0.3). The validator reads only this file.
//
// Sources, checked 2026-10-26:
//  [CR]  Riftbound Core Rules §103 "Deck Construction", via the RiftJudge rules browser
//        (app.riftjudge.com/rules/core/103…). Rule numbers below refer to it.
//  [DB]  "Deckbuilding 101" on riftbound.gg (official site) — battlefield count for constructed play
//        and sideboard size, which the Core Rules leave to the mode of play / tournament rules.
// Re-check when Riot publishes a new Core Rules revision. Values marked `TODO verify` are the ones
// with a weaker source.

export const GAME_RULES = {
  sourcesCheckedOn: "2026-10-26",

  formats: ["STANDARD"] as const,

  /** [CR 103.2] A deck has exactly 1 Champion Legend. */
  legend: { count: 1 },

  /** [CR 103.3.a.2] One Chosen Champion: a Champion Unit whose champion tag matches the Legend's. */
  chosenChampion: { count: 1 },

  /** [CR 103.3] The Main Deck is at least 40 cards, including the Chosen Champion. No maximum. */
  mainDeck: { minSize: 40, maxSize: null as number | null },

  /**
   * [CR 103.3.b] Up to 3 copies of the same named card, Chosen Champion included.
   * [DB] The limit spans Main Deck + Sideboard together.
   */
  copyLimitByName: 3,

  /** [CR 103.3.d] At most 3 Signature cards in total, all sharing the Legend's champion tag. */
  signatureCards: { maxTotal: 3 },

  /** [CR 103.4.a] Exactly 12 Rune cards, matching the Legend's domain identity. */
  runeDeck: { size: 12 },

  /**
   * [CR 103.5] Count set by the mode of play; no two with the same name.
   * [DB] Constructed play uses 3 unique Battlefields.
   */
  battlefields: { count: 3, unique: true },

  /** [DB] Sideboard is exactly 8 or 0 cards (no sideboarding in best-of-one). TODO verify against tournament rules. */
  sideboard: { allowedSizes: [0, 8] as number[] },

  /**
   * [CR 103.2.b] Domain identity comes from the Legend's domains. A multi-domain card needs all its
   * domains in the identity; a card with no domain fits any identity (Riftcodex labels those "Colorless").
   */
  domainIdentity: { alwaysAllowed: ["Colorless"] },

  /**
   * Banned cards by exact card name. Rulings entered in Phase 4 (News & Alerts) add to this at runtime.
   * TODO verify: populate from Riot's official ban list if one is in effect.
   */
  bannedCardNames: [] as string[],
} as const;

export type GameRules = typeof GAME_RULES;
