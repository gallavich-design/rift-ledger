"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, PlusCircle } from "lucide-react";
import { CONDITIONS, type Condition } from "@/lib/domain/enums";
import { formatMoney } from "@/lib/money/money";
import { Button } from "@/components/ui/Button";
import { AddedResult } from "@/components/collection/AddedResult";
import { Segmented, TextField } from "@/components/ui/fields";
import { BinderPicker, type BinderValue, type LocationOption } from "@/components/collection/BinderPicker";
import { quickAddToCollection } from "@/app/collection/actions";

/**
 * "Add to collection": the printing you're looking at, straight into your collection — quantity,
 * condition and binder, without the purchase form. Saved as a one-line order (undo = delete it).
 */
export function QuickAdd({
  variantId,
  printingLabel,
  cardName,
  market,
  currency,
  locations,
  defaultBinder,
  today,
}: {
  variantId: string;
  printingLabel: string;
  cardName: string;
  market: number | null;
  currency: string;
  locations: LocationOption[];
  defaultBinder: BinderValue;
  today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [condition, setCondition] = useState<Condition>("NM");
  const [binder, setBinder] = useState<BinderValue>(defaultBinder);
  const [cost, setCost] = useState<"market" | "zero">("market");
  const [acquiredOn, setAcquiredOn] = useState(today);
  const [result, setResult] = useState<{ ok: boolean; text: string; lotIds?: string[] } | null>(null);

  return (
    <>
      <Button
        onClick={() => {
          setResult(null);
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        data-testid="quick-add"
      >
        <PlusCircle size={15} aria-hidden /> Add to collection
      </Button>
      {result?.ok && <AddedResult text={result.text} lotIds={result.lotIds ?? []} testid="quick-add-result" />}
      {open && (
        <section className="basis-full space-y-4 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4" aria-label="Add to collection" data-testid="quick-add-panel">
          <p className="text-sm text-ink-2">
            Adding <span className="font-medium text-ink">{cardName}</span> · {printingLabel}
            <span className="block text-xs text-ink-3">For copies you already have — pulled from packs, traded or owned from before. Pick another printing above to add that one instead.</span>
          </p>
          <div className="flex flex-wrap items-end gap-5">
            <div>
              <span className="mb-1.5 block text-sm font-medium">Copies</span>
              <span className="inline-flex items-center rounded-[var(--radius-control)] border border-rule">
                <button type="button" className="grid size-10 place-items-center text-ink-2 hover:bg-hover disabled:opacity-40" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="One fewer copy">
                  <Minus size={14} />
                </button>
                <input
                  aria-label="Copies"
                  inputMode="numeric"
                  value={qty}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/\D/g, ""));
                    setQty(Math.min(1000, Math.max(1, n || 1)));
                  }}
                  className="num h-10 w-12 border-x border-rule bg-transparent text-center text-sm font-semibold focus:outline-none"
                  data-testid="quick-add-qty"
                />
                <button type="button" className="grid size-10 place-items-center text-ink-2 hover:bg-hover" onClick={() => setQty((q) => Math.min(1000, q + 1))} aria-label="One more copy">
                  <Plus size={14} />
                </button>
              </span>
            </div>
            <Segmented label="Condition" name={`qa-cond-${variantId}`} value={condition} onChange={setCondition} options={CONDITIONS.map((c) => ({ value: c, label: c }))} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <BinderPicker locations={locations} value={binder} onChange={setBinder} />
            <TextField label="Owned since" type="date" value={acquiredOn} max={today} onChange={(e) => setAcquiredOn(e.target.value)} />
          </div>
          <Segmented
            label="Track value from"
            name={`qa-cost-${variantId}`}
            value={cost}
            onChange={setCost}
            options={[
              { value: "market", label: market != null ? `Today's price · ${formatMoney(market * qty, currency)}` : "Today's price (none yet → 0)" },
              { value: "zero", label: "No cost" },
            ]}
          />
          <p className="text-xs text-ink-3">“Today&rsquo;s price” starts your gain/loss at zero today, so you see how the value moves from here. “No cost” counts the whole value as gain. Not a purchase — use “Add purchase” to record what you paid.</p>
          {result && !result.ok && (
            <p role="alert" className="text-sm text-loss">
              {result.text}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              disabled={pending || ("newName" in binder && !binder.newName.trim())}
              onClick={() =>
                start(async () => {
                  const r = await quickAddToCollection({ variantId, quantity: qty, condition, cost, binder, acquiredOn });
                  if (r.ok) {
                    setResult({ ok: true, text: r.message ?? "Added.", lotIds: r.data.lotIds });
                    setOpen(false);
                    setQty(1);
                    router.refresh();
                  } else setResult({ ok: false, text: r.message });
                })
              }
              data-testid="quick-add-confirm"
            >
              {pending ? "Adding…" : `Add ${qty} to collection`}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </section>
      )}
    </>
  );
}
