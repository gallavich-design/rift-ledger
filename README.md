# Rift Ledger

A Riftbound collection, portfolio and deck tracker. Light mode only.
Built in phases — see `CHANGELOG.md` for what exists today and `NEXT.md` for what's queued.

## Setup

Requires Node 22+.

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env        # DATABASE_URL="file:./dev.db" is enough for local dev
npx prisma migrate deploy   # creates prisma/dev.db (use `npm run db:migrate` while developing the schema)
npm run sync:cards          # downloads every released set from Riftcodex (~1 minute)
npm run sync:prices         # TCGplayer prices + FX rates for today (~10 seconds)
npm run dev                 # http://localhost:3000
```

The app runs with **zero API keys**: card data comes from Riftcodex, TCGplayer prices from
tcgcsv.com and exchange rates from Frankfurter (ECB) — all free. Local (Thailand) prices and manual
overrides are entered by you. Settings → **Load demo data** builds a separate demo account to explore.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run sync:cards` | Refresh the local card catalogue. Idempotent — safe to run daily. |
| `npm run sync:prices` | Daily price job (FX + TCGplayer). One snapshot per printing per source per day. |
| `npm test` | Vitest unit tests (includes every worked example from the spec) |
| `npm run e2e` | Playwright tests. Needs `npm run build`, synced cards and prices. Runs on a copy (`prisma/e2e.db`), never your data. |
| `npm run typecheck` / `lint` | TypeScript / ESLint |
| `npx tsx scripts/make-icons.ts` | Re-render the PWA PNG icons from `public/icon.svg` |
| `npx tsx scripts/verify-roundtrip.ts <export.json> <new.db>` | Import an export into a brand-new database and print its dashboard totals |

## Keeping card data fresh

The catalogue is stored locally and never fetched per page view. Refresh it once a day, either:

- **cron on your machine:** `15 4 * * * cd /path/to/rift-ledger && npm run sync:cards`
- **hosted:** call `GET /api/cron/sync-cards` with `Authorization: Bearer $CRON_SECRET`
  (e.g. a Vercel Cron entry). Without `CRON_SECRET` the endpoint only answers on localhost.
- or press **Sync now** in Settings.

## The daily price job

`npm run sync:prices` (or `GET /api/cron/sync-prices`, same auth as above, or Settings → Update prices now):

1. **FX** — USD→THB and USD→EUR from Frankfurter (ECB reference rates). A failure here doesn't stop
   card prices; the last stored rate is used. Rates can be overridden in Settings.
2. **TCGplayer** — catalogue + prices for category 89 from tcgcsv.com, which refreshes once a day
   around 20:00 UTC (03:00 Bangkok). Schedule the job after that, e.g. `30 4 * * *` in Bangkok time.
3. **Finishes** — TCGplayer prices Normal and Foil separately. Printings TCGplayer sells only as
   foil become FOIL variants; printings sold both ways get both. Variants anyone owns are never touched.
4. **Snapshots** — upserted on (printing, source, day), so re-running a day overwrites, never duplicates.
   "Day" is the calendar day in Asia/Bangkok (`src/config/app.ts`).

5. **Sealed** — TCGplayer products with no collector number or rarity (booster packs, displays, cases,
   bundles) get a daily `SealedPriceSnapshot`, keyed (product, source, day) like card prices.

Prices that match neither a Riftcodex printing nor a sealed product (sets Riftcodex hasn't added yet)
are counted as "unmatched" and skipped.

## Money rules

- Every amount is integer minor units + currency. Purchases keep the currency actually paid; prices
  keep their source currency. Conversion happens only for display.
- **Landed cost**: an order's shipping, forwarding, duty and fees are spread over its lines by value
  (`src/lib/money/landedCost.ts`); any rounding remainder goes to the most expensive item.
- **Sales** consume purchases FIFO (`src/lib/money/fifo.ts`), using each lot's exact landed total.
- **Valuation** = a manual override if you set one, else the chosen source (TCGplayer market, falling
  back to mid then low; or your latest local report), × the condition multiplier from Settings.

## How card data is modelled

Riftcodex returns **one record per printing**. Sync groups printings into game cards:

- **Card** = one rules object, keyed by normalised name + type (`Card.key`). Comma/dash spellings
  that upstream uses inconsistently ("Sett, Brawler" / "Sett - Brawler") collapse into one card.
- **CardVariant** = a printing (standard, alternate art, overnumbered, signature, metal, promo), with
  its own set, collector number, image and `tcgplayerId`. **Prices attach to variants.**
- Rules text is taken from the standard printing — alt arts upstream often drop the reminder text.
- Riftcodex's `riftbound_id` is **not unique** (e.g. a Metal promo shares it with the normal promo),
  so variants are keyed by Riftcodex's own `id` (`CardVariant.sourceId`).

Foil/normal finishes aren't in Riftcodex; they'll come from the TCGplayer price feed in Phase 2.

## Adding a data provider

Interfaces live in `src/lib/providers/types.ts`:

- `CardDataProvider` — sets and printings (implemented: `riftcodex.ts`)
- `PriceProvider` — prices per variant (Phase 2: TCGplayer via tcgcsv.com, manual, local)
- `DecklistProvider` — tournament decklists (Phase 4)

To add one: create `src/lib/providers/<name>.ts`, validate every response with Zod (fail loudly
with a clear message when the shape changes), use `fetchJson` from `http.ts` for timeouts and
backoff on 429/5xx, and export an object implementing the interface. Keep keys in `.env` and
document them in `.env.example`.

## Decks

- Paste a list on **Decks → New deck**. Accepted: section headers (`Legend:`, `Champion:`, `Main Deck:`,
  `Runes:`, `Battlefields:`, `Sideboard:`) and lines like `3 Name`, `3x Name`, `Name x3`, `Name (3)`.
  Legends, runes and battlefields are sorted by card type even without headers; if no Chosen Champion
  is given, one copy of the first champion matching the Legend is promoted. Unmatched lines are kept
  on the deck to fix.
- Legality comes only from `src/config/gameRules.ts` (sources cited there). Banned cards: add names to
  `bannedCardNames`, or enter a ban in News & Alerts (Phase 4).
- Proxies count toward legality but never as owned, so they appear in cost to complete.

## Rulings, alerts and the watchlist

- **News & Alerts → Add ruling** records errata, bans, unbans and rotations. Owners and players of the
  affected cards get one alert each; bans make decks illegal immediately; a rotation ruling sets that
  set's rotation date (overriding `config/rotation.ts`).
- **Watch** a printing from its card page. Target alerts fire when the price crosses the target;
  ±% move alerts at most once a week. Watches are checked by the daily price job and right after you
  enter a manual or local price.
- **Meta**: paste tournament lists to see % owned and cost to complete against your collection.

## Sealed product, pack opening and the binder

- **Sealed** (`/sealed`): link a box or pack to its TCGplayer product for daily prices, or set a manual
  price (it shows when you set it). Landed cost each = (price × qty + shipping/forwarding/tax) ÷ qty.
- **Opening** one unit splits its landed cost across the pulls by market value at that moment
  (`allocatePackCost`, spec Example C): cost basis = value × box cost ÷ pulls value, whole cents with
  the leftover cents on the most valuable pull, so the lots add up to exactly what the box cost. If
  nothing is priced yet, the split is by card count. Every pull becomes a lot linked to the opening;
  "Undo this opening" removes them and puts the box back (only if none of them has been sold).
- **Set binder** (`/collection/binder`): one slot per printing (normal and foil fill the same slot);
  "Base set" = standard and promo art, "Every printing" adds alternate, overnumbered and signature.
  Cost to complete = the cheapest priced printing of each missing slot.

## Trade, reports and your data

- **Trade calculator** (`/trade`) prices both sides with the same price book as card pages and the
  dashboard (default valuation source, manual override wins), in your display currency, with your
  condition multipliers. **Haves & wants** can be shared as a read-only link (`/share/trade/<token>`).
- **Value report** (`/reports`, `GET /api/reports/value?format=pdf|csv&source=…`) is built by
  `buildPortfolio()` — the same function the dashboard uses — so its total always equals the dashboard
  for the same source. The PDF uses IBM Plex (OFL, `@ibm/plex-*`) and shows amounts as `THB 1,234.00`.
- **Export / import** (Settings → Your data): one JSON file with everything you entered plus the
  cards, price history and FX rates it depends on. References travel by stable keys (`variantKey`,
  `Card.key`, `Set.code`), so an export imports into a fresh database — even one that hasn't synced
  cards — and reproduces the same dashboard totals. Import only goes into an empty collection.
  Alerts aren't exported (they're regenerated). Lots and sales are also available as CSV.
- **PWA**: manifest + PNG/maskable icons + a service worker that caches only the static shell and shows
  an offline page; prices are never served from cache. Install from the browser menu on a phone.

## Where things live

- `src/config/gameRules.ts` — every deck-construction rule (values marked `TODO verify`)
- `src/config/rotation.ts` — Standard rotation dates per set (`TODO verify`)
- `src/config/domains.ts` — domain accent colours (one tokens file)
- `.interface-design/system.md` — design system decisions
- `prisma/schema.prisma` — full domain model; money is always integer minor units + currency code

## Deploying on Postgres

Change `provider = "sqlite"` to `"postgresql"` in `prisma/schema.prisma`, point `DATABASE_URL` at
Postgres, and run `npx prisma migrate deploy`. The schema avoids SQLite-only features.
