# Changelog

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
