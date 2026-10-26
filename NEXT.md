# Next

## Deferred from Phase 1
- **Auth.js (NextAuth)** — every user-owned table already has `userId`; v1 runs as one local owner
  (`src/lib/currentUser.ts`). Wire magic-link or Google sign-in before deploying publicly.
- **shadcn/ui CLI** — components are written in shadcn style (cva + Radix Slot) by hand rather than
  pulled from the registry. Add real shadcn primitives (Dialog, Popover, Command) as phases need them.
- Catalogue sync runs ~60 s (network-bound across 15 pages). Fine daily; could fetch pages in parallel.

## Deferred from Phase 2
- **Cardmarket prices** — a legitimate public route exists (Cardmarket's price-guide download, game 22
  = Riftbound, keyed by Cardmarket expansion ids that Riftcodex already maps), but products carry no
  collector number, so matching is by set + name and is ambiguous for alt arts. Plan: match only
  unambiguous products, list the rest for manual linking.
- **CSV / paste-a-list bulk import** and a downloadable template (spec §4.3).
- **"Cards vs sealed" breakdown** — needs sealed products (Phase 5).
- Historical FX: values convert at the latest rate. A purchase's THB cost at the time it was paid
  could be stored per order if wanted.
- Today's change and movers use near-mint prices (condition multipliers apply to totals, not to deltas).
- Three TCGplayer groups (Legacy, Radiance, Secret Garden) aren't in Riftcodex yet, so they can't be priced.

## Deferred from Phase 3
- **Piltover Archive import** — `piltoverarchive.com/api/external/v1/decks` answers, but the site's
  robots.txt disallows `/api/`, so it isn't used (spec: don't scrape sites that forbid it). Ask the
  site owners for permission or a key; until then, paste the list.
- Tokens (e.g. "Gold // Buff") can be added to a deck; the Core Rules text read for §103 doesn't
  state they're excluded, so the validator doesn't invent a rule. Revisit with the full rules.
- One physical copy used in two decks counts as owned in both.

## Deferred from Phase 4
- Rulings are entered by hand (spec v1). Automatic checking of Riot's announcements is listed under
  Future.
- Price impact needs 30 days of daily prices either side of a ruling, so it fills in over time.
- Prisma `migrate dev` stops on warnings in a non-interactive shell; schema changes with warnings are
  generated with `prisma migrate diff` and applied with `migrate deploy` (see CHANGELOG, Phase 4).

## Verify before relying on them (`TODO verify`)
- `src/config/gameRules.ts` — sourced from Core Rules §103 on 2026-10-26; only the sideboard size (0 or 8) is still `TODO verify`.
- `src/config/rotation.ts` — rotation dates and which set codes count as Sets 1–5.
- `src/config/domains.ts` — domain hues vs official iconography.

## Future (spec §9 — not scheduled)
- Camera scanning to add cards by photo.
- Automatic scraping of official announcements for rulings.
- Multi-user / friends' collections and trade matching.
