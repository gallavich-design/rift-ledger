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

Prices TCGplayer lists that don't match a Riftcodex printing (sealed product, and sets Riftcodex
hasn't added yet) are counted as "unmatched" and skipped.

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

## Where things live

- `src/config/gameRules.ts` — every deck-construction rule (values marked `TODO verify`)
- `src/config/rotation.ts` — Standard rotation dates per set (`TODO verify`)
- `src/config/domains.ts` — domain accent colours (one tokens file)
- `.interface-design/system.md` — design system decisions
- `prisma/schema.prisma` — full domain model; money is always integer minor units + currency code

## Deploying on Postgres

Change `provider = "sqlite"` to `"postgresql"` in `prisma/schema.prisma`, point `DATABASE_URL` at
Postgres, and run `npx prisma migrate deploy`. The schema avoids SQLite-only features.
