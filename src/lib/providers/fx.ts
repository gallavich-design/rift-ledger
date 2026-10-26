// Daily FX from Frankfurter (European Central Bank reference rates; free, no key).
// Verified 2026-10-26: https://api.frankfurter.dev/v1/latest?base=USD&symbols=THB,EUR

import { z } from "zod";
import { fetchJson } from "./http";

const FX_BASE = process.env.FX_BASE_URL ?? "https://api.frankfurter.dev/v1";

const Latest = z.object({ base: z.string(), date: z.string(), rates: z.record(z.string(), z.number().positive()) });

export interface FxQuote {
  base: "USD";
  quote: string;
  rateE6: number; // units of quote per 1 USD × 1e6
  asOf: string; // the provider's rate date (ECB publishes on working days)
  source: string;
}

export async function fetchUsdRates(quotes = ["THB", "EUR"]): Promise<FxQuote[]> {
  const raw = await fetchJson(`${FX_BASE}/latest?base=USD&symbols=${quotes.join(",")}`);
  const r = Latest.safeParse(raw);
  if (!r.success) throw new Error(`Frankfurter response did not match the expected shape: ${r.error.message}`);
  return quotes.map((q) => {
    const rate = r.data.rates[q];
    if (!rate) throw new Error(`Frankfurter returned no ${q} rate`);
    return { base: "USD", quote: q, rateE6: Math.round(rate * 1_000_000), asOf: r.data.date, source: "frankfurter (ECB)" };
  });
}
