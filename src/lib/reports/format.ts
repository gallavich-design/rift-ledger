// Plain-text formatting for files (PDF/CSV): currency codes instead of symbols so every glyph
// renders with the embedded Latin font, and a +/− sign instead of ▲/▼.

const TWO_DP = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STAMP = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function money(minor: number | null, currency: string, sign = false): string {
  if (minor == null) return "—";
  const body = TWO_DP.format(Math.abs(minor) / 100);
  const s = minor < 0 ? "−" : sign && minor > 0 ? "+" : "";
  return `${s}${currency} ${body}`;
}

export function pct(p: number | null): string {
  if (p == null) return "—";
  return `${p < 0 ? "−" : p > 0 ? "+" : ""}${Math.abs(p).toFixed(1)}%`;
}

export function formatStampPlain(d: Date): string {
  return STAMP.format(d);
}
