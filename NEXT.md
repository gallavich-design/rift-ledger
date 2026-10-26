# Next

## Deferred from Phase 1
- **Auth.js (NextAuth)** — every user-owned table already has `userId`; v1 runs as one local owner
  (`src/lib/currentUser.ts`). Wire magic-link or Google sign-in before deploying publicly.
- **shadcn/ui CLI** — components are written in shadcn style (cva + Radix Slot) by hand rather than
  pulled from the registry. Add real shadcn primitives (Dialog, Popover, Command) as phases need them.
- **"Load demo data"** button — lands with Phase 2, when there's portfolio data to demo. Demo rows
  will live under a separate `isDemo` user so they never mix with real data.
- Catalogue sync runs ~60 s (network-bound across 15 pages). Fine daily; could fetch pages in parallel.

## Verify before relying on them (`TODO verify`)
- `src/config/gameRules.ts` — deck size, copy limit, rune deck, battlefields, sideboard, signature rules.
- `src/config/rotation.ts` — rotation dates and which set codes count as Sets 1–5.
- `src/config/domains.ts` — domain hues vs official iconography.

## Future (spec §9 — not scheduled)
- Camera scanning to add cards by photo.
- Automatic scraping of official announcements for rulings.
- Multi-user / friends' collections and trade matching.
