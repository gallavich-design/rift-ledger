# Changelog

## 2026-10-28 — Pick a card's printing from the deck view

No schema changes (uses the existing per-line preferred printing).

- The card pop-up has a **Printing** section when a card has more than one: a thumbnail for each art (standard, alternate, overnumbered, signature…) plus a list of every printing with its price.
- Picking one swaps the art right away: the deck pictures, the pop-up, list thumbnails, the decks list (for the Legend), shared links and the image export all show the printing you chose. Its card number, price and cost to complete follow it. Save the deck to keep it.
- Cards you've set to a non-default printing get a small label (e.g. "Overnumbered · Foil").

## 2026-10-28 — Deck page shows card pictures

- Decks now open in a **Cards** view like Piltover Archive: Legend and Runes on top, then Battlefields, Main deck (Chosen Champion first) and Sideboard, each with a count against its target (12/12, 3/3, 40/40, 10/10) and a ×N badge on every card.
- Click any card to see its details: picture, type, rarity and domains, Energy / Power / Might, rules text, set and card number. In your own deck you can change the copies right there; the dialog also says how many you own.
- **List** toggle keeps the old rows (printing, proxies, sideboard moves). The choice is remembered; `?view=list` opens it directly.
- Shared deck links show the same picture view (no prices, no ownership).
- Right column: Stats now comes first, with Legality and Cost under it. The column no longer sticks while scrolling, so it scrolls smoothly with the page instead of waiting for the deck to end.

## Deck image options, sideboard 10, new stats panel (2026-10-28)

No schema changes.

- Deck image is always an **A4 page** (portrait, 1240 × 1754 px = 150 dpi); cards shrink to fit.
- Image **layout**: deck order, or **by card type** (Units / Gear / Spells, each with its copies;
  Legend, runes, battlefields and champion stay on top; sideboard last).
- Image **background**: six presets (Paper, White, Sand, Slate, Navy, Black) or any custom colour;
  text switches to light on dark backgrounds. Live preview in the export panel; the last choice is
  remembered on this device.
- **Sideboard** limit is now up to 10 cards (was exactly 0 or 8) — `gameRules.ts`, per the owner's
  update; still `TODO verify` whether it must be exactly 10.
- Deck **Stats** panel (styled after Piltover Archive): Cards / Avg energy / Avg power tiles; energy
  and power curves stacked by domain colour with a value axis, counts and a hover split; a Domains
  bar with chips ("2 active") and a Card types bar with chips ("3 types"). Because some domain colour
  pairs are close for colour-blind readers, segments have 2px gaps, every domain is named with its
  count, hovers list the split, and a screen-reader table carries the numbers.


## Deck image as a card grid (2026-10-28)

No schema changes.

- Deck → Export → **Image** now makes a card-grid PNG: Legend name above the deck name, legality and
  section counts, then every card's art with a ×N badge in deck order (Legend, runes, battlefields
  turned upright, chosen champion, main deck by cost), sideboard below. Frames take the card's domain
  colour. Light theme. **Preview** opens it in a new tab.
- Drawn on the server (`/decks/<id>/image`, next/og + IBM Plex) so card art from the card sites can be
  embedded — a browser canvas can't export images from other sites.


## "I own all of these" on decks (2026-10-28)

No schema changes.

- Deck cost panel: **I own all of these** adds every copy the deck needs that isn't in your
  collection yet — counting any printing you already own — as one order ("From deck: <name>").
  You pick the cost basis (market price, matching cost to complete, or not recorded) and the date.
  Proxied copies are left alone unless you tick that you have the real cards (which also clears the
  proxy marks). Undo by deleting the order. Works from the saved deck.


## Radiance in the catalogue (2026-10-28)

No schema changes.

- Riftcodex (the card database) doesn't list Radiance yet. The card sync now also reads TCGplayer's
  card data (via tcgcsv.com) for any full set Riftcodex is missing: name, type, domains, costs,
  might, text, tags, rarity, number, printing (alternate art, overnumbered, signature) and image.
  Radiance: 167 new cards plus 11 reprints, 333 printings, all with TCGplayer prices.
- When Riftcodex adds such a set, the sync switches those printings to Riftcodex's data in place
  (matched by TCGplayer product id), so lots, decks and watches keep working.
- Card pages built from TCGplayer data say so (costs show as numbers, not symbols).
- Bundles with only a few promo cards (Secret Garden, T1 Worlds bundles, Worlds Bundle 2025) are
  not added this way; Legacy (Jan 2027) will be once TCGplayer lists its cards.
- Radiance has no Standard rotation date yet (`TODO verify` in `config/rotation.ts`).


## Speed-ups (2026-10-28)

No schema changes.

- Date and money formatting reuse their formatters instead of building new ones on every call
  (`dayKey`, `formatMoney`, price stamps, report formatting). Loading a 900-card collection's lots
  went from ~120 ms to ~25 ms, and its card details from ~185 ms to ~60 ms.
- Collection list is paged (50 printings a page) with a "Find a card" box; totals still cover every
  matching card. A 900-printing collection page went from 2.7 MB / 1.6 s to ~170 KB / 0.2 s.
- A thin progress bar appears the moment you click a link, so a slow page never looks like a dead click.
- E2E: price fixtures are re-dated to "today" so the suite doesn't depend on when dev.db was synced;
  extra test servers are stopped with their whole process group.


## After Phase 5 — sign-in, bulk import, deploy (2026-10-26)

No schema changes.

### Added
- **Sign-in gate**: one owner password (`APP_PASSWORD`), signed 30-day session cookie (HMAC, httpOnly,
  Secure behind HTTPS), sign-in page, sign out in Settings, failed attempts slowed down. Share links,
  cron and PWA files stay public; private APIs answer 401. A production server without a password
  answers 503 with setup instructions (opt out with `RIFT_LEDGER_OPEN=1` on a trusted machine).
- **Bulk import** (Collection → Import): paste a list ("3 Jinx - Rebel", "OGN-202 foil") or upload a CSV
  (comma, semicolon or tab; template download; a Rift Ledger lots export imports as-is). Rows are
  matched by set + number, exact name, or a flagged best guess; the preview shows each match, what's
  ambiguous and what's not found. Missing prices use the market price (or 0, your choice). Saved as
  orders grouped by date, seller and currency; storage locations are created by name.
- **Deploy**: Dockerfile (SQLite on a `/data` volume), `fly.toml` (Singapore), start script that runs
  migrations and fills the catalogue on first boot, and a GitHub Actions daily sync.

### Changed
- Cron endpoints no longer trust the Host header to allow unauthenticated calls: without `CRON_SECRET`
  they run only in development or with `RIFT_LEDGER_OPEN=1`.


## Phase 5 — Extras (2026-10-26)

### Schema migrations
- `phase5_sealed_prices_trade_lists`: new `SealedPriceSnapshot` (daily sealed prices, unique on
  product + source + day) and `TradeListItem` (haves/wants); `SealedProduct` gains `manualPrice`,
  `manualCurrency`, `imageUrl`, `storageLocationId`; `Settings.tradeShareToken`. All additive; existing
  sealed rows copied unchanged.
- `phase5_sealed_manual_price_at`: `SealedProduct.manualPriceAt`, so a manual sealed price shows when
  it was set. Rows that already had a manual price get the migration time.

### Added
- Price job stores sealed product prices (packs, displays, cases, bundles) from TCGplayer.
- Sealed: add products (TCGplayer-linked or by name), positions with value, source and time, price
  history, manual price, delete.
- Pack/box opening: search-as-you-type pulls, live pulls-vs-paid result, then one lot per pull with its
  value-weighted share of the box cost (Example C). Opening page with cost ratio, pull stats by rarity
  and special printings, and undo.
- Dashboard: sealed value and cost are in the totals and the value chart; new "Cards vs sealed" breakdown.
- Set completion binder: grid per set, owned vs missing, % complete, cost to complete, base set or
  every printing.
- Trade: two-sided calculator (condition-adjusted, prices match card pages), haves & wants lists with a
  read-only share link.
- Reports: collection value report as PDF (totals by set, top 50 cards with images, graded, sealed,
  valuation source and dates) and CSV; total equals the dashboard.
- Settings → Your data: full JSON export (importable into a fresh database), lots CSV, sales CSV, import.
- PWA: PNG + maskable icons, Apple touch icon, shortcuts, service worker with an offline page.
- Sealed, Trade and Reports appear in the navigation.

### Fixed
- The card picker no longer pulls focus back after a pick if you've already moved to another field.


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
