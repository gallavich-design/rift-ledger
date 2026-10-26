// Chart series colours. Light mode only (project rule).
// Validated 2026-10-26 with the dataviz validator against #ffffff, ALL pairs (any two sources can
// share a chart): "#1f4fb5,#eb6834,#1baf7a" → every hard check PASS (worst CVD ΔE 9.2, normal-vision
// ΔE 27.6). No 4th hue clears all pairs, so the manual override is drawn as a dashed neutral line
// (encoding, not colour), and demo prices take slot 1 in place of TCGplayer — never beside it.
// #1baf7a is < 3:1 on white → relief rule: these charts always ship a legend, direct last-value
// labels and a table view. Colour is fixed per source, never re-assigned by rank.

export const SOURCE_SERIES_COLOR: Record<string, string> = {
  TCGPLAYER: "#1f4fb5", // slot 1 — quill
  LOCAL: "#eb6834", // slot 2
  CARDMARKET: "#1baf7a", // slot 3
  MANUAL: "#474c56", // neutral ink, dashed
  DEMO: "#1f4fb5", // slot 1 — only ever shown instead of TCGplayer
};

export const VALUE_COLOR = "#1f4fb5";
/** Cost basis is a reference line: neutral ink, dashed — recessive next to value. */
export const COST_COLOR = "#626873";
export const GRID_COLOR = "rgba(22,24,29,0.06)";
export const AXIS_TEXT = "#626873";
/** Single-hue magnitude bars (breakdowns). Identity comes from the text label on each bar. */
export const BAR_COLOR = "#1f4fb5";
