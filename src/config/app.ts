// App-wide settings that aren't per-user.

/** Calendar days (snapshot keys, "today") are counted in the primary user's timezone. */
export const APP_TZ = "Asia/Bangkok";

// Building an Intl.DateTimeFormat is expensive (~0.1 ms); dayKey runs once per lot, sale and price
// row, so formatters are created once per timezone and reused.
const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** YYYY-MM-DD for a moment, in APP_TZ. */
export function dayKey(d: Date = new Date(), tz = APP_TZ): string {
  let f = dayFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormatters.set(tz, f);
  }
  return f.format(d);
}

/** Midday UTC of a day key — a safe Date to store for "the day of" without timezone flips. */
export function dayToDate(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

export function addDays(day: string, n: number): string {
  const d = dayToDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
