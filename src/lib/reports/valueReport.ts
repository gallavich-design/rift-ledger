// Collection value report (spec §4.11): totals by set, the 50 most valuable cards, graded cards,
// sealed product, and the valuation source + date. Built from buildPortfolio(), the same function the
// dashboard uses, so the report total always equals the dashboard total for the same source.

import { ART_LABEL, SEALED_KIND_LABEL, SOURCE_LABEL, type SealedKind, type VariantArt } from "@/lib/domain/enums";
import type { Portfolio } from "@/lib/portfolio/full";
import { formatStampPlain } from "./format";

export interface ReportCardRow {
  variantId: string;
  setCode: string;
  setName: string;
  number: number | null;
  name: string;
  printing: string;
  finish: string;
  language: string;
  graded: string | null;
  rarity: string;
  quantity: number;
  unit: number | null;
  value: number | null;
  cost: number;
  pl: number | null;
  source: string | null;
  priceAsOf: Date | null;
  imageUrl: string | null;
}

export interface ReportData {
  generatedAt: Date;
  display: string;
  source: string;
  sourceLabel: string;
  latestPriceAt: Date | null;
  fx: { quote: string; rate: number; note: string }[];
  totals: Portfolio["totals"];
  bySet: { setCode: string; setName: string; copies: number; value: number; cost: number }[];
  cards: ReportCardRow[]; // every open position, by value desc
  top: ReportCardRow[];
  graded: ReportCardRow[];
  sealed: { name: string; kind: string; quantity: number; unit: number | null; value: number | null; cost: number; source: string | null; priceAsOf: Date | null }[];
}

export function buildReport(pf: Portfolio, now = new Date()): ReportData {
  const cards: ReportCardRow[] = pf.positions
    .map((p) => {
      const v = pf.info.get(p.variantId)!;
      return {
        variantId: p.variantId,
        setCode: v.setCode,
        setName: v.setName,
        number: v.collectorNumber,
        name: v.name,
        printing: ART_LABEL[v.art as VariantArt] ?? v.art,
        finish: v.finish === "FOIL" ? "Foil" : "Normal",
        language: v.language,
        graded: v.graded,
        rarity: v.rarity,
        quantity: p.quantity,
        unit: p.value != null && p.quantity ? Math.round(p.value / p.quantity) : null,
        value: p.value,
        cost: p.cost,
        pl: p.pl,
        source: p.quote?.source ?? null,
        priceAsOf: p.quote?.asOf ?? null,
        imageUrl: v.imageUrl,
      };
    })
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.name.localeCompare(b.name));

  const sets = new Map<string, ReportData["bySet"][number]>();
  for (const c of cards) {
    const s = sets.get(c.setCode) ?? { setCode: c.setCode, setName: c.setName, copies: 0, value: 0, cost: 0 };
    s.copies += c.quantity;
    s.value += c.value ?? 0;
    s.cost += c.cost;
    sets.set(c.setCode, s);
  }

  const stamps = [...cards.map((c) => c.priceAsOf), ...pf.sealed.map((s) => s.quote?.asOf ?? null)].filter(Boolean) as Date[];
  return {
    generatedAt: now,
    display: pf.display,
    source: pf.source,
    sourceLabel: SOURCE_LABEL[pf.source] ?? pf.source,
    latestPriceAt: stamps.length ? new Date(Math.max(...stamps.map((d) => d.getTime()))) : null,
    fx: pf.fx.rates.map((r) => ({ quote: r.quote, rate: r.rateE6 / 1e6, note: r.overridden ? "your override" : `${r.source}${r.day ? `, stored ${r.day}` : ""}` })),
    totals: pf.totals,
    bySet: [...sets.values()].sort((a, b) => b.value - a.value),
    cards,
    top: cards.filter((c) => c.value != null).slice(0, 50),
    graded: cards.filter((c) => c.graded),
    sealed: pf.sealed.map((s) => ({
      name: s.name,
      kind: SEALED_KIND_LABEL[s.kind as SealedKind] ?? s.kind,
      quantity: s.remaining,
      unit: s.value != null ? Math.round(s.value / s.remaining) : null,
      value: s.value,
      cost: s.cost,
      source: s.quote?.source ?? null,
      priceAsOf: s.quote?.asOf ?? null,
    })),
  };
}

// ───────────────────────────── CSV ─────────────────────────────

const cell = (v: string | number | null | undefined) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dec = (minor: number | null) => (minor == null ? "" : (minor / 100).toFixed(2));

/** One row per open position and per sealed product, then a TOTAL row equal to the dashboard. */
export function reportCsv(r: ReportData): string {
  const head = ["type", "set", "number", "name", "printing", "finish", "language", "graded", "rarity", "quantity", `unit_${r.display}`, `value_${r.display}`, `cost_basis_${r.display}`, `unrealized_${r.display}`, "price_source", "price_updated"];
  const rows: (string | number | null)[][] = [head];
  for (const c of r.cards) {
    rows.push(["card", c.setCode, c.number, c.name, c.printing, c.finish, c.language, c.graded, c.rarity, c.quantity, dec(c.unit), dec(c.value), dec(c.cost), dec(c.pl), c.source ? (SOURCE_LABEL[c.source] ?? c.source) : "", c.priceAsOf?.toISOString() ?? ""]);
  }
  for (const s of r.sealed) {
    rows.push(["sealed", "", "", s.name, s.kind, "", "", "", "", s.quantity, dec(s.unit), dec(s.value), dec(s.cost), s.value == null ? "" : dec(s.value - s.cost), s.source ? (SOURCE_LABEL[s.source] ?? s.source) : "", s.priceAsOf?.toISOString() ?? ""]);
  }
  rows.push(["TOTAL", "", "", `Valuation: ${r.sourceLabel}, generated ${formatStampPlain(r.generatedAt)} (Bangkok)`, "", "", "", "", "", r.totals.copies, "", dec(r.totals.value), dec(r.totals.cost), dec(r.totals.unrealized), r.sourceLabel, r.latestPriceAt?.toISOString() ?? ""]);
  return "﻿" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
