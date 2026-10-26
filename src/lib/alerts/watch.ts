// Watchlist alert rules (spec §4.4). Pure: given a watch's state and today's price, decide which
// alerts fire and what state to remember. Alerts fire when a price *crosses* the target, not on
// every check while it stays past it.

export type Side = "ABOVE" | "BELOW";

export interface WatchState {
  targetPrice: number | null; // minor units, in the watch's currency
  targetDir: Side | null; // alert when price goes ABOVE (≥) or BELOW (≤) the target
  movePct: number | null; // alert when the 7-day move is at least ±this %
  lastSide: Side | null;
  lastMoveAlertDay: string | null;
}

export interface WatchCheck {
  day: string; // YYYY-MM-DD
  price: number | null; // current price, watch currency
  priceWeekAgo: number | null;
}

export type WatchAlert =
  | { kind: "PRICE_TARGET"; dir: Side; target: number; price: number }
  | { kind: "PRICE_MOVE"; pct: number; from: number; to: number };

export function sideOf(price: number, target: number, dir: Side): Side {
  // "reached" counts as being on the target side: ≥ for ABOVE, ≤ for BELOW
  if (dir === "ABOVE") return price >= target ? "ABOVE" : "BELOW";
  return price <= target ? "BELOW" : "ABOVE";
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function evaluateWatch(w: WatchState, c: WatchCheck): { alerts: WatchAlert[]; lastSide: Side | null; lastMoveAlertDay: string | null } {
  const alerts: WatchAlert[] = [];
  let lastSide = w.lastSide;
  let lastMoveAlertDay = w.lastMoveAlertDay;
  if (c.price == null) return { alerts, lastSide, lastMoveAlertDay };

  if (w.targetPrice != null && w.targetDir) {
    const side = sideOf(c.price, w.targetPrice, w.targetDir);
    if (side === w.targetDir && w.lastSide !== w.targetDir) alerts.push({ kind: "PRICE_TARGET", dir: w.targetDir, target: w.targetPrice, price: c.price });
    lastSide = side;
  }

  if (w.movePct != null && w.movePct > 0 && c.priceWeekAgo) {
    const pct = ((c.price - c.priceWeekAgo) / c.priceWeekAgo) * 100;
    const cooledDown = !w.lastMoveAlertDay || daysBetween(w.lastMoveAlertDay, c.day) >= 7;
    if (Math.abs(pct) >= w.movePct && cooledDown) {
      alerts.push({ kind: "PRICE_MOVE", pct, from: c.priceWeekAgo, to: c.price });
      lastMoveAlertDay = c.day;
    }
  }
  return { alerts, lastSide, lastMoveAlertDay };
}
