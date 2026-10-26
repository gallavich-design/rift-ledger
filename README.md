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
npm run dev                 # http://localhost:3000
```

The app runs with **zero API keys**: card data comes from Riftcodex (free, no key).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run sync:cards` | Refresh the local card catalogue. Idempotent — safe to run daily. |
| `npm test` | Vitest unit tests |
| `npm run e2e` | Playwright smoke tests (needs `npm run build` and a synced catalogue first) |
| `npm run typecheck` / `lint` | TypeScript / ESLint |

## Keeping card data fresh

The catalogue is stored locally and never fetched per page view. Refresh it once a day, either:

- **cron on your machine:** `15 4 * * * cd /path/to/rift-ledger && npm run sync:cards`
- **hosted:** call `GET /api/cron/sync-cards` with `Authorization: Bearer $CRON_SECRET`
  (e.g. a Vercel Cron entry). Without `CRON_SECRET` the endpoint only answers on localhost.
- or press **Sync now** in Settings.

The daily **price** job arrives in Phase 2 and will be documented here.

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
