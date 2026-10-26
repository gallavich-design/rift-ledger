# Rift Ledger — interface system

## Direction
A broker statement printed on good paper. Calm, precise, light mode only (never dark mode, no toggle).
User: a Bangkok player-collector checking value after an order lands, or mid-deckbuild. Numbers must be scannable.

## Tokens (src/app/globals.css)
- Surfaces: `--paper` canvas (#FBFAF7, faint warm paper), `--sheet` raised (#FFFFFF), `--inset` inputs (#F3F1EC — darker = "type here").
- Ink: `--ink` primary, `--ink-2` secondary, `--ink-3` metadata (AA on white), `--ink-4` placeholder/disabled only.
- Rules (borders): `--rule` standard rgba ink 9%, `--rule-soft` 6%, `--rule-strong` 16%; focus ring = `--quill` 2px.
- Accent: `--quill` fountain-pen blue (#1F4FB5). The only accent. Links, primary buttons, focus, selection.
- Semantic: `--gain` #0B7A43, `--loss` #B42318 — always paired with ▲/▼ and +/− (never colour alone).
- Domains: `--dom-fury` etc. in src/config/domains.ts (single source). TODO verify hues vs official iconography.

## Depth
Borders only. No shadows except popovers (one soft shadow). Sidebar shares the canvas colour, separated by `--rule`.

## Radius
4px controls/chips, 8px panels, 12px card art (mimics card corners).

## Type
IBM Plex Sans (+ Plex Sans Thai fallback) for UI; IBM Plex Mono with tabular-nums for every number, ticker and price.
Headlines 600 with -0.01em tracking; labels 500 uppercase 11px 0.06em tracking for section eyebrows.

## Spacing
4px base. Component padding 12/16, section gap 24/32.

## Signature
- Ticker: `SET·NNN` mono chip on every printing (component `Ticker`).
- Domain stripe: 3px stripe atop card art, split for multi-domain (component `DomainStripe`).

## Patterns
- Nav: left rail (desktop ≥ md), bottom tab bar (mobile). Unbuilt phases shown as non-link "Soon" rows, never as links.
- Tables → stacked rows below sm.
- Empty states: one sentence + one action.
