"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { VariantPicker, variantLabel, type PickedVariant } from "@/components/cards/VariantPicker";
import { SelectField, TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/Button";
import { Delta, SourceStamp } from "@/components/money/Money";
import { formatMoney } from "@/lib/money/money";
import { lineValue, tradeTotals } from "@/lib/trade/trade";
import type { UnitQuote } from "@/lib/prices/quote";
import { quoteTrade } from "./actions";

interface Line {
  key: string;
  variant: PickedVariant;
  quantity: string;
  condition: string;
}
type Side = "mine" | "theirs";
let seq = 0;

export function TradeCalculator({
  currency,
  conditions,
  haves,
  wants,
}: {
  currency: string;
  conditions: Record<string, number>;
  haves: { quantity: number; variant: PickedVariant }[];
  wants: { quantity: number; variant: PickedVariant }[];
}) {
  const [lines, setLines] = useState<Record<Side, Line[]>>({ mine: [], theirs: [] });
  const [quotes, setQuotes] = useState<Record<string, UnitQuote>>({});
  const [err, setErr] = useState<string | null>(null);

  const ids = useMemo(() => [...new Set([...lines.mine, ...lines.theirs].map((l) => l.variant.id))].sort().join(","), [lines]);
  useEffect(() => {
    if (!ids) return;
    let live = true;
    quoteTrade(ids.split(","))
      .then((r) => {
        if (!live) return;
        setQuotes(r.quotes);
        setErr(r.missing.length ? `No exchange rate for ${r.missing.join(", ")}` : null);
      })
      .catch(() => live && setErr("Couldn't load prices."));
    return () => {
      live = false;
    };
  }, [ids]);

  const add = (side: Side, v: PickedVariant | null, qty = 1) => {
    if (!v) return;
    setLines((ls) => {
      const i = ls[side].findIndex((l) => l.variant.id === v.id && l.condition === "NM");
      const next = i >= 0 ? ls[side].map((l, j) => (j === i ? { ...l, quantity: String((Number(l.quantity) || 0) + qty) } : l)) : [...ls[side], { key: `t${++seq}`, variant: v, quantity: String(qty), condition: "NM" }];
      return { ...ls, [side]: next };
    });
  };
  const update = (side: Side, key: string, patch: Partial<Line>) => setLines((ls) => ({ ...ls, [side]: ls[side].map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const remove = (side: Side, key: string) => setLines((ls) => ({ ...ls, [side]: ls[side].filter((l) => l.key !== key) }));

  const toTrade = (l: Line) => ({ key: l.key, quantity: Math.max(0, Math.floor(Number(l.quantity) || 0)), unit: quotes[l.variant.id]?.unit ?? null, conditionPct: conditions[l.condition] ?? 100 });
  const t = tradeTotals(lines.mine.map(toTrade), lines.theirs.map(toTrade));

  const panel = (side: Side, title: string, quick: { quantity: number; variant: PickedVariant }[], quickLabel: string) => (
    <section aria-labelledby={`${side}-h`} className="min-w-0 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4" data-testid={`trade-${side}`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id={`${side}-h`} className="text-base font-semibold">
          {title}
        </h2>
        <span className="num text-base font-medium" data-testid={`trade-${side}-total`}>
          {formatMoney(side === "mine" ? t.give : t.get, currency)}
        </span>
      </div>
      <VariantPicker value={null} onChange={(v) => add(side, v)} label="Add a card" resetOnPick />
      {quick.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-quill">{quickLabel}</summary>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {quick.map((q) => (
              <li key={q.variant.id}>
                <button type="button" onClick={() => add(side, q.variant)} className="rounded-[var(--radius-control)] border border-rule px-2 py-1 hover:border-quill">
                  {q.variant.name} <span className="num text-ink-3">×{q.quantity}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {lines[side].length === 0 ? (
        <p className="mt-4 text-center text-sm text-ink-3">No cards yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-rule-soft border-t border-rule-soft">
          {lines[side].map((l) => {
            const q = quotes[l.variant.id];
            const v = lineValue(toTrade(l));
            return (
              <li key={l.key} className="grid grid-cols-[minmax(0,1fr)_56px_76px_auto] items-center gap-2 py-2.5" data-testid="trade-line">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{l.variant.name}</p>
                  <p className="num truncate text-xs text-ink-3">{variantLabel(l.variant)}</p>
                  <p className="text-xs">
                    <span className="num" data-testid="trade-unit">
                      {q ? formatMoney(q.unit, currency) : "—"}
                    </span>
                    <span className="text-ink-3"> each</span>
                    {v != null && Number(l.quantity) > 1 && <span className="num text-ink-3"> · {formatMoney(v, currency)}</span>}
                  </p>
                  {q ? <SourceStamp source={q.source} asOf={new Date(q.asOf)} /> : <span className="text-xs text-caution">No price</span>}
                </div>
                <TextField label="Qty" hideLabel aria-label={`Quantity of ${l.variant.name}`} inputMode="numeric" className="num" value={l.quantity} onChange={(e) => update(side, l.key, { quantity: e.target.value })} />
                <SelectField
                  label="Condition"
                  hideLabel
                  aria-label={`Condition of ${l.variant.name}`}
                  value={l.condition}
                  onChange={(e) => update(side, l.key, { condition: e.target.value })}
                  options={Object.entries(conditions).map(([c, pct]) => ({ value: c, label: pct === 100 ? c : `${c} ${pct}%` }))}
                />
                <Button variant="ghost" size="sm" aria-label={`Remove ${l.variant.name}`} onClick={() => remove(side, l.key)}>
                  <Trash2 size={14} aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  const hasAny = lines.mine.length + lines.theirs.length > 0;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {panel("mine", "You give", haves, "From your haves")}
        {panel("theirs", "You get", wants, "From your wants")}
      </div>
      <div className="rounded-[var(--radius-panel)] border border-rule bg-sheet px-4 py-3" data-testid="trade-summary">
        {!hasAny ? (
          <p className="text-sm text-ink-3">Add cards on both sides to compare.</p>
        ) : (
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span className="eyebrow">Difference</span>
            <Delta amount={t.difference} currency={currency} className="text-base font-medium" />
            <span className="text-ink-2">{t.difference > 0 ? "in your favour" : t.difference < 0 ? "in their favour" : "— an even trade"}</span>
            {t.unpriced > 0 && <span className="text-xs text-caution">{t.unpriced} card(s) without a price aren&rsquo;t counted</span>}
          </p>
        )}
        {err && <p className="mt-1 text-xs text-caution">{err}</p>}
        <p className="mt-1 text-xs text-ink-3">Condition adjusts each card&rsquo;s value by your multipliers in Settings (NM = 100%).</p>
      </div>
    </div>
  );
}
