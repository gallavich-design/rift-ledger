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

## Verify before relying on them (`TODO verify`)
- `src/config/gameRules.ts` — deck size, copy limit, rune deck, battlefields, sideboard, signature rules.
- `src/config/rotation.ts` — rotation dates and which set codes count as Sets 1–5.
- `src/config/domains.ts` — domain hues vs official iconography.

## Future (spec §9 — not scheduled)
- Camera scanning to add cards by photo.
- Automatic scraping of official announcements for rulings.
- Multi-user / friends' collections and trade matching.
