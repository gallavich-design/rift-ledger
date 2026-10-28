"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LibraryBig } from "lucide-react";
import { formatMoney } from "@/lib/money/money";
import { Button } from "@/components/ui/Button";
import { Segmented, TextField } from "@/components/ui/fields";
import { BinderPicker, type BinderValue, type LocationOption } from "@/components/collection/BinderPicker";
import { completeSet } from "../actions";

/**
 * "Complete the set": asks which binder, then adds one copy of every card from this set's checklist
 * that you don't have, as one order (undo = delete it).
 */
export function CompleteSet({
  setCode,
  setName,
  scope,
  missing,
  have,
  marketTotal,
  unpriced,
  currency,
  locations,
  defaultBinder,
  today,
}: {
  setCode: string;
  setName: string;
  scope: "base" | "all";
  missing: number;
  have: number;
  marketTotal: number;
  unpriced: number;
  currency: string;
  locations: LocationOption[];
  defaultBinder: BinderValue;
  today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [binder, setBinder] = useState<BinderValue>(defaultBinder);
  const [cost, setCost] = useState<"market" | "zero">("market");
  const [moveOwned, setMoveOwned] = useState(false);
  const [acquiredOn, setAcquiredOn] = useState(today);
  const [result, setResult] = useState<{ ok: boolean; text: string; orderId?: string | null } | null>(null);
  const checklist = scope === "all" ? "every printing" : "the base set";
  const hasBinder = !("none" in binder);

  if (!open)
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
        {missing > 0 ? (
          <Button
            variant="secondary"
            onClick={() => {
              setResult(null);
              setOpen(true);
            }}
            data-testid="complete-set"
          >
            <LibraryBig size={15} aria-hidden /> Complete the set
          </Button>
        ) : (
          <p className="text-sm text-gain">You have every card in {checklist}.</p>
        )}
        {result?.ok && (
          <p role="status" className="text-sm text-gain" data-testid="complete-set-result">
            {result.text}{" "}
            {result.orderId && (
              <Link href={`/collection/orders/${result.orderId}`} className="text-quill hover:underline">
                View or undo
              </Link>
            )}
          </p>
        )}
      </div>
    );

  return (
    <section className="mt-4 space-y-4 border-t border-rule pt-4" aria-label="Complete the set" data-testid="complete-set-panel">
      <p className="text-sm">
        Add <span className="num font-medium">{missing}</span> {missing === 1 ? "card" : "cards"} — one of each card in {checklist} of <span className="font-medium">{setName}</span> you don&rsquo;t have.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <BinderPicker label="Put them in" locations={locations} value={binder} onChange={setBinder} />
        <TextField label="Owned since" type="date" value={acquiredOn} max={today} onChange={(e) => setAcquiredOn(e.target.value)} />
      </div>
      {have > 0 && hasBinder && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={moveOwned} onChange={(e) => setMoveOwned(e.target.checked)} data-testid="complete-set-move" />
          <span>
            Also move the {setCode} cards I already own into this binder
            <span className="block text-xs text-ink-3">So the whole set is in one place. Cards from this set in other binders or deck boxes move too.</span>
          </span>
        </label>
      )}
      <Segmented
        label="Cost basis"
        name={`cs-cost-${setCode}`}
        value={cost}
        onChange={setCost}
        options={[
          { value: "market", label: `Market · ${formatMoney(marketTotal, currency)}` },
          { value: "zero", label: "Don't record" },
        ]}
      />
      {cost === "market" && unpriced > 0 && <p className="text-xs text-caution">{unpriced} without a price will cost 0.</p>}
      <p className="text-xs text-ink-3">Each card is added once, in its normal finish where it has one, condition NM. It&rsquo;s saved as one order you can delete to undo.</p>
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
              const r = await completeSet({ setCode, scope, cost, binder, moveOwned: moveOwned && hasBinder, acquiredOn });
              if (r.ok) {
                setResult({ ok: true, text: r.message ?? "Done.", orderId: r.data.orderId });
                setOpen(false);
                router.refresh();
              } else setResult({ ok: false, text: r.message });
            })
          }
          data-testid="complete-set-confirm"
        >
          {pending ? "Adding…" : `Add ${missing} ${missing === 1 ? "card" : "cards"}`}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
