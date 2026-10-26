"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { VariantPicker, variantLabel, type PickedVariant } from "@/components/cards/VariantPicker";
import { SelectField, TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/Button";
import { Delta, SourceStamp } from "@/components/money/Money";
import { CONDITIONS } from "@/lib/domain/enums";
import { formatMoney } from "@/lib/money/money";
import { allocatePackCost, packResult } from "@/lib/sealed/pack";
import type { UnitQuote } from "@/lib/prices/quote";
import { openSealed, quotePulls } from "../../actions";

interface Line {
  key: string;
  variant: PickedVariant;
  quantity: string;
  condition: string;
}

export function OpenForm({
  sealedId,
  boxCost,
  currency,
  today,
  minDay,
  locations,
  defaultLocation,
}: {
  sealedId: string;
  boxCost: number;
  currency: string;
  today: string;
  minDay: string;
  locations: { id: string; name: string }[];
  defaultLocation: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [lines, setLines] = useState<Line[]>([]);
  const [openedOn, setOpenedOn] = useState(today);
  const [loc, setLoc] = useState(defaultLocation);
  const [quotes, setQuotes] = useState<Record<string, UnitQuote>>({});
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const ids = useMemo(() => [...new Set(lines.map((l) => l.variant.id))].sort().join(","), [lines]);
  useEffect(() => {
    if (!ids) return;
    let live = true;
    quotePulls(ids.split(","), currency)
      .then((r) => {
        if (!live) return;
        setQuotes(r.quotes);
        setQuoteError(r.missing.length ? `No exchange rate for ${r.missing.join(", ")}` : null);
      })
      .catch(() => live && setQuoteError("Couldn't load prices — values will be filled in when you save."));
    return () => {
      live = false;
    };
  }, [ids, currency]);

  function add(v: PickedVariant | null) {
    if (!v) return;
    setLines((ls) => {
      const i = ls.findIndex((l) => l.variant.id === v.id && l.condition === "NM");
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) } : l));
      return [...ls, { key: `${v.id}-${Date.now()}`, variant: v, quantity: "1", condition: "NM" }];
    });
  }
  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const valid = lines.length > 0 && lines.every((l) => Number.isInteger(Number(l.quantity)) && Number(l.quantity) >= 1);
  const alloc = useMemo(
    () => (valid ? allocatePackCost(boxCost, lines.map((l) => ({ key: l.key, quantity: Number(l.quantity), unitMarket: quotes[l.variant.id]?.unit ?? 0 }))) : []),
    [valid, lines, quotes, boxCost],
  );
  const pullsValue = alloc.reduce((a, p) => a + p.lineValue, 0);
  const result = valid ? packResult(boxCost, pullsValue) : null;
  const cards = lines.reduce((a, l) => a + (Number(l.quantity) || 0), 0);
  const unpriced = lines.filter((l) => !quotes[l.variant.id]).length;

  function submit() {
    if (!valid) return setFormError(lines.length ? "Quantities must be whole numbers, 1 or more." : "Add at least one pull.");
    setFormError(null);
    start(async () => {
      const r = await openSealed({
        sealedId,
        openedOn,
        storageLocationId: loc || null,
        pulls: lines.map((l) => ({ variantId: l.variant.id, quantity: Number(l.quantity), condition: l.condition as (typeof CONDITIONS)[number] })),
      });
      if (r.ok) router.push(`/sealed/openings/${r.data.openingId}?saved=1`);
      else setFormError(r.message);
    });
  }

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <section className="grid gap-4 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:p-5">
        <TextField label="Opened on" type="date" value={openedOn} min={minDay} max={today} onChange={(e) => setOpenedOn(e.target.value)} />
        <SelectField label="Put pulls in" value={loc} onChange={(e) => setLoc(e.target.value)} options={[{ value: "", label: "Unassigned" }, ...locations.map((l) => ({ value: l.id, label: l.name }))]} />
      </section>

      <section aria-labelledby="pulls-h" className="rounded-[var(--radius-panel)] border border-rule bg-sheet p-4 sm:p-5">
        <h2 id="pulls-h" className="mb-3 text-base font-semibold">
          Pulls <span className="num text-sm font-normal text-ink-3">· {cards} cards</span>
        </h2>
        <VariantPicker value={null} onChange={add} label="Add a pull" autoFocus resetOnPick />
        <p className="mt-1.5 text-xs text-ink-3">Type a name, Enter, pick the printing. Picking the same printing again adds one more.</p>
        {lines.length > 0 && (
          <ul className="mt-4 divide-y divide-rule-soft border-t border-rule-soft" data-testid="pull-lines">
            {lines.map((l) => {
              const a = alloc.find((x) => x.key === l.key);
              const q = quotes[l.variant.id];
              return (
                <li key={l.key} className="grid grid-cols-[minmax(0,1fr)_64px_96px_auto] items-end gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_64px_96px_140px_auto]">
                  <div className="min-w-0 self-center">
                    <p className="truncate text-sm font-medium">{l.variant.name}</p>
                    <p className="num truncate text-xs text-ink-3">{variantLabel(l.variant)}</p>
                    {q ? <SourceStamp source={q.source} asOf={new Date(q.asOf)} /> : <span className="text-xs text-caution">No price yet</span>}
                  </div>
                  <TextField label="Qty" hideLabel inputMode="numeric" className="num" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} aria-label={`Quantity of ${l.variant.name}`} />
                  <SelectField label="Condition" hideLabel value={l.condition} onChange={(e) => update(l.key, { condition: e.target.value })} options={CONDITIONS.map((c) => ({ value: c, label: c }))} aria-label={`Condition of ${l.variant.name}`} />
                  <p className="col-span-3 text-right text-xs sm:col-span-1 sm:self-center">
                    <span className="num block text-sm text-ink">{a ? formatMoney(a.lineValue, currency) : "—"}</span>
                    <span className="text-ink-3">
                      cost <span className="num" data-testid="pull-cost">{a ? formatMoney(a.costBasis, currency) : "—"}</span>
                    </span>
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`Remove ${l.variant.name}`}>
                    <Trash2 size={14} aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {quoteError && <p className="mt-2 text-xs text-caution">{quoteError}</p>}
      </section>

      <div className="sticky bottom-16 z-10 -mx-4 border-t border-rule bg-paper/95 px-4 py-3 backdrop-blur md:bottom-0 md:mx-0 md:rounded-[var(--radius-panel)] md:border md:bg-sheet md:px-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <dl className="flex flex-1 flex-wrap gap-x-6 gap-y-1 text-sm">
            <div>
              <dt className="eyebrow">You paid</dt>
              <dd className="num">{formatMoney(boxCost, currency)}</dd>
            </div>
            <div>
              <dt className="eyebrow">Pulls worth</dt>
              <dd className="num font-medium" data-testid="pulls-value">
                {formatMoney(pullsValue, currency)}
                {unpriced > 0 && <span className="ml-1 text-xs font-normal text-caution">({unpriced} unpriced)</span>}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Result</dt>
              <dd data-testid="pack-result">{result ? <Delta amount={result.change} currency={currency} pct={result.pct} /> : <span className="num text-ink-3">—</span>}</dd>
            </div>
          </dl>
          {formError && (
            <p role="alert" className="text-sm text-loss">
              {formError}
            </p>
          )}
          <Button type="submit" disabled={pending || !lines.length}>
            {pending ? "Saving…" : `Save opening · ${cards} cards`}
          </Button>
        </div>
      </div>
    </form>
  );
}
