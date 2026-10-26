# Changelog

## Phase 4 — Rulings, alerts & meta (2026-10-26)

### Schema migration `phase4_rulings_watch_alerts_meta`
- `RulingEvent.setCode` (rotation rulings apply to a set), `WatchItem.lastSide` / `lastMoveAlertDay` /
  `deckId`, `Alert.dedupeKey` (unique per user), `MetaDeck.pendingImportLines`. All nullable or defaulted;
  no data rewritten. Generated with `prisma migrate diff` and applied with `migrate deploy`, because
  `migrate dev` needs an interactive terminal to accept the (harmless) uniqueness warning.

### Added
- News & Alerts: alerts inbox (unread badge in the nav), rulings feed, "Add ruling" for errata, bans,
  unbans and rotations, and a ruling page with the errata diff, affected cards you own/play and the
  30-days-before vs after price impact.
- A ruling alerts every user who owns an affected card or has it in a deck (one alert per ruling).
- Decks: "✕ X banned — deck no longer legal", "⚠ N cards errata'd on date" and "↻ N cards rotate in
  N months" badges, on the deck and the decks list. Bans feed the legality checker.
- Rotation: a set's date comes from its latest rotation ruling, else `config/rotation.ts`. Shown on
  cards ("OGN rotates in 14 months"), decks, and the dashboard (value of your cards that rotate, by date).
- Watchlist: watch any printing with a target (at or below / at or above), a ±% in 7 days move, and
  a pre-order price. Alerts fire when the price crosses the target (not every day it stays past it),
  checked after the daily price job and whenever you enter a manual or local price. Still-to-buy
  cards on a deck link to a watch that remembers the deck ("a card your deck needs").
- Pre-release: banner for sets in preview and for 4 weeks after each release; "price since release"
  (pre-order → week 1 → week 4 → now) on card pages.
- Meta ("What can I build?"): paste-import tournament lists with event, placement and date; each shows
  % owned, missing copies, cost to complete (normal and budget); sort by cheapest / % owned / newest,
  filter by Legend, domain and date; one-click copy to your decks. Cards show "in N meta decks".
- Phone navigation: four tabs (Dashboard, Collection, Decks, Alerts) plus a More menu.

### Fixed
- Bans dated "today" didn't apply until 19:00 Bangkok time (dates are now compared as calendar days).

### Tests
- 115 unit tests (watch crossing rules, errata diff, rotation, price impact, meta summary/sorting).
- 32 browser checks across Phases 1–4 (6 new).


## Phase 3 — Decks (2026-10-26)

### Schema migration `phase3_deck_pending_import_lines`
- New `Deck.pendingImportLines` (JSON, default `[]`): decklist lines an import couldn't match, kept
  so they can be fixed later. Existing decks get an empty list.

### Game rules
- `src/config/gameRules.ts` now cites Riftbound Core Rules §103 (via RiftJudge) for every value:
  1 Legend, 1 Chosen Champion matching the Legend's tag, main deck ≥ 40 incl. champion, 3 copies per
  name (champion and sideboard included), ≤ 3 Signature cards sharing the Legend's tag, 12 runes,
  3 unique battlefields, domain identity from the Legend. Sideboard 0 or 8 comes from riftbound.gg's
  official deckbuilding guide (still `TODO verify` against the tournament rules).

### Added
- Deck builder: sections for Legend, Chosen Champion, main deck, runes, battlefields, sideboard;
  add cards by typing (Enter adds one); steppers; move a copy to/from sideboard; make Chosen Champion.
- Live legality checker: one specific, actionable message per broken rule, with the offending
  cards marked in the list.
- Cost panel: deck value, owned vs missing, cost to complete (Example D), budget build at the
  cheapest printing of each card with every swap and its saving, still-to-buy list.
- Proxies / borrowed copies: count for legality, never as owned.
- Per-card "printing to price" choice.
- Stats: energy curve, type and domain split, average energy.
- Versions: every save records a snapshot and a "−2 X, +2 Y" diff; restore any version.
- Paste-a-decklist import: tolerant of common formats and typos; unmatched lines are kept and listed
  with suggestions to fix or dismiss.
- Export: text (round-trips through the importer), CSV with printings and prices, PNG image of the list.
- Read-only share link (no prices, collection or owner shown).
- Match log with win rate overall and by opponent Legend.
- Deck value over time.
- Card page: "Add to deck" and "In your decks".

### Fixed
- Search index kept multi-word champion tags ("Master Yi") intact.
- Match form: a fast second entry could be lost while the previous one saved.

### Tests
- 102 unit tests incl. Example D, a break-and-fix test for every rule, budget ≤ normal, import, diff, win rates.
- 26 browser checks across Phases 1–3 (7 new for decks).


## Phase 2 — Portfolio (2026-10-26)

### Schema migration `phase2_variant_key_tcg_products_lot_total`
- `CardVariant.sourceId` no longer unique; new unique `variantKey` (printing|finish|language|grading|grade),
  backfilled as `sourceId|NORMAL|EN||`. Lets one printing exist as both Normal and Foil.
- New `TcgProduct` table (TCGplayer catalogue: finishes sold, single vs sealed).
- New `Lot.landedTotal` (exact landed cost of a lot), backfilled as `landedUnitCost × quantity`.
- Applied with a Prisma migration; no rows lost (1,451 variants before and after).

### Added
- Purchases: one form for a single card or a whole TCGplayer + forwarder order, with live landed-cost
  preview; landed cost allocated by value (Example A). Order receipt page with per-line landed cost.
- Sales: FIFO consumption with a live preview of which copies are sold and the realized P/L (Example B).
- Collection: positions with cost, value (with source + time), P/L, storage location; filter by
  location and set; move copies between locations from the card page.
- Prices: TCGplayer via tcgcsv.com (daily, free), local Thailand price reports (THB, where seen, when),
  manual override per printing. Daily idempotent price job + cron endpoint + "Update prices now".
- Finish reconciliation from TCGplayer data: 704 printings corrected to foil-only, 454 foil variants added.
- FX: daily USD→THB/EUR from Frankfurter (ECB) with per-currency override; display in THB/USD/EUR (Example E).
- Dashboard: market value, cost basis, unrealized, realized, today's change; portfolio value vs cost
  basis chart (1W–ALL) with crosshair tooltip and table view; top gainers/losers by % or amount;
  biggest positions; breakdowns by set, rarity, domain, printing, finish, language, graded/raw;
  valuation source switcher.
- Card page: price headline, every source with its timestamp, multi-source price chart,
  "Import or buy local?" (TCGplayer × your average landed-cost ratio vs latest local price), your copies.
- Condition multipliers (NM/LP/MP/HP/DMG) in Settings.
- Load demo data: a separate demo account (6 months of history, 4 orders, a sale, local reports) on
  real cards, with its own DEMO price source and a persistent banner; never mixes with your data.
- Chart palette validated for colour-blind separation; manual-override line uses a dashed neutral
  encoding because no fourth hue clears every pair.

### Tests
- 62 unit tests incl. Examples A, B, E, FIFO edge cases, history/movers, import-vs-local, finish planner.
- Browser tests now run on an isolated copy of the database (`prisma/e2e.db`); 11 new Phase 2 checks.


## Phase 1 — Foundation (2026-10-26)

### Added
- Next.js 15 (App Router) + TypeScript + Tailwind v4 project, Prisma 6 on SQLite, Vitest, Playwright.
- Full Prisma domain schema for all phases (catalogue, prices, orders/lots/sales, sealed, decks,
  meta, rulings, alerts, watchlist, settings). Money is integer minor units + currency everywhere.
- Riftcodex card-data provider with Zod validation, pagination, timeouts and 429/5xx backoff.
- Idempotent catalogue sync (`npm run sync:cards`, Settings → Sync now, `/api/cron/sync-cards`):
  8 sets, 938 cards, 1,451 printings as of today. Re-running creates no duplicates; vanished
  printings are removed only if nothing references them.
- Typo-tolerant search (word-level optimal-string-alignment scoring) — "jinks", "yasou",
  "mastr yi honned", "kaisa" all find the right card.
- Cards page: search-as-you-type, set/type/domain filters, paged grid.
- Card detail page: hero art, ticker, type line, domain chips, Energy/Might/Power, rules text
  (keywords and rune/energy/might/exhaust icons rendered safely — no upstream HTML injected),
  flavour, every printing with its own art, ticker, rarity and TCGplayer link.
- ⌘K / Ctrl+K palette for cards, sets and storage locations.
- Settings: storage locations (create / edit / delete, validated) and catalogue status.
- Light-mode design tokens, left rail (desktop) + bottom tab bar (phone). Unbuilt screens are shown
  as non-link "P2…P5" rows, never as links.
- `gameRules.ts`, `rotation.ts`, `domains.ts` config files (values marked `TODO verify`).
- PWA manifest + icon.

### Tests
- 20 unit tests (grouping, variant art mapping, rules-text parser incl. HTML-injection case,
  search ranking against typos).
- 8 Playwright checks covering every Phase 1 Definition of Done item.
