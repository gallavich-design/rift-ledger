// Rotation countdowns. Dates are YYYY-MM-DD strings.

/** Whole calendar months from `today` until `date` (0 when it's less than a month away; negative once past). */
export function monthsUntil(today: string, date: string): number {
  const [ty, tm, td] = today.split("-").map(Number);
  const [y, m, d] = date.split("-").map(Number);
  let months = (y - ty) * 12 + (m - tm);
  if (d < td) months -= 1;
  return months;
}

/** "rotates in 14 months" — pass plural for a plural subject ("20 cards rotate in 14 months"). */
export function rotationLabel(today: string, date: string, plural = false): string {
  const verb = plural ? "rotate" : "rotates";
  if (date <= today) return `rotated ${date}`;
  const n = monthsUntil(today, date);
  if (n <= 0) return `${verb} this month`;
  return `${verb} in ${n} month${n === 1 ? "" : "s"}`;
}

/** Earliest upcoming rotation among some dates, or null. */
export function nextRotation(today: string, dates: (string | null | undefined)[]): string | null {
  const upcoming = dates.filter((d): d is string => !!d && d > today).sort();
  return upcoming[0] ?? null;
}

/** Average price in the window before vs after a ruling (spec §4.7 price impact). */
export function priceImpact(series: { day: string; amount: number }[], rulingDay: string, windowDays = 30) {
  const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const r = toMs(rulingDay);
  const w = windowDays * 86_400_000;
  const before = series.filter((p) => toMs(p.day) < r && toMs(p.day) >= r - w);
  const after = series.filter((p) => toMs(p.day) >= r && toMs(p.day) <= r + w);
  const avg = (xs: { amount: number }[]) => (xs.length ? Math.round(xs.reduce((a, x) => a + x.amount, 0) / xs.length) : null);
  const b = avg(before);
  const a = avg(after);
  return { before: b, after: a, changePct: b && a != null ? ((a - b) / b) * 100 : null, pointsBefore: before.length, pointsAfter: after.length };
}
