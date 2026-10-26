# Changelog

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
