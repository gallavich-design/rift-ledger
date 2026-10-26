// Money is always an integer number of minor units (cents / satang) plus an ISO currency code.
// THB, USD and EUR all have 2 decimal places. No floating point arithmetic touches stored amounts.

import type { Currency } from "@/lib/domain/enums";

export interface Money {
  amount: number; // minor units, integer
  currency: string;
}

export const MINOR_UNITS: Record<string, number> = { THB: 2, USD: 2, EUR: 2 };

const SYMBOL: Record<string, string> = { THB: "฿", USD: "$", EUR: "€" };

/** Parse a user-typed decimal ("1,234.5", "฿99") into minor units without float error. Returns null if invalid. */
export function parseMoneyInput(input: string): number | null {
  const s = input.replace(/[฿$€,\s]/g, "");
  if (!/^-?\d*(\.\d{0,2})?$/.test(s) || s === "" || s === "-" || s === ".") return null;
  const neg = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const v = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  return neg ? -v : v;
}

/** Convert an upstream decimal price (e.g. 12.43 USD) to minor units. Rounds to nearest. */
export function decimalToMinor(x: number | null | undefined): number | null {
  if (x == null || !Number.isFinite(x)) return null;
  return Math.round(x * 100);
}

export function formatMoney(
  amount: number,
  currency: string,
  opts: { sign?: boolean; compact?: boolean } = {},
): string {
  const abs = Math.abs(amount) / 100;
  const sym = SYMBOL[currency] ?? `${currency} `;
  const body =
    opts.compact && abs >= 10_000
      ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(abs)
      : abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = amount < 0 ? "−" : opts.sign && amount > 0 ? "+" : "";
  return `${sign}${sym}${body}`;
}

/** Percent with one decimal, e.g. +12.5%. `basis` 0 → null. */
export function pct(change: number, basis: number): number | null {
  if (!basis) return null;
  return (change / basis) * 100;
}

export function formatPct(p: number | null, sign = true): string {
  if (p == null) return "—";
  const s = p < 0 ? "−" : sign && p > 0 ? "+" : "";
  return `${s}${Math.abs(p).toFixed(1)}%`;
}

// ───────────────────────────── FX ─────────────────────────────

/** Rates relative to USD, scaled by 1e6: { USD: 1_000_000, THB: 33_000_000, EUR: 893_420 }. */
export type FxTable = Record<string, number>;

function roundDiv(n: bigint, d: bigint): bigint {
  // round half away from zero
  const neg = n < BigInt(0) !== d < BigInt(0);
  const an = n < BigInt(0) ? -n : n;
  const ad = d < BigInt(0) ? -d : d;
  const q = (an * BigInt(2) + ad) / (ad * BigInt(2));
  return neg ? -q : q;
}

export class MissingRateError extends Error {}

export function convert(amount: number, from: string, to: string, fx: FxTable): number {
  if (from === to) return amount;
  const rFrom = fx[from];
  const rTo = fx[to];
  if (!rFrom || !rTo) throw new MissingRateError(`No FX rate for ${from}→${to}`);
  // all currencies here have 2 minor digits, so minor units convert at the major-unit rate
  return Number(roundDiv(BigInt(amount) * BigInt(rTo), BigInt(rFrom)));
}

export function isCurrency(c: string): c is Currency {
  return c === "THB" || c === "USD" || c === "EUR";
}
