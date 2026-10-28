"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { ownershipShortfall, type CardPricing } from "@/lib/decks/cost";
import type { DeckLine } from "@/lib/decks/types";
import { formatMoney } from "@/lib/money/money";
import { Button } from "@/components/ui/Button";
import { Segmented, TextField } from "@/components/ui/fields";
import { markDeckOwned } from "../actions";

/**
 * "I own all of these": adds the copies this deck needs that aren't in your collection yet, as one
 * order. Shown with the cost panel; works from the saved deck.
 */
export function MarkOwned({
  deckId,
  lines,
  owned,
  pricing,
  names,
  currency,
  today,
  dirty,
}: {
  deckId: string;
  lines: DeckLine[];
  owned: Map<string, number>;
  pricing: Map<string, CardPricing>;
  names: Map<string, string>;
  currency: string;
  today: string;
  dirty: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [includeProxies, setIncludeProxies] = useState(false);
  const [cost, setCost] = useState<"market" | "zero">("market");
  const [acquiredOn, setAcquiredOn] = useState(today);
  const [result, setResult] = useState<{ ok: boolean; text: string; orderId?: string | null } | null>(null);

  const withoutProxies = useMemo(() => ownershipShortfall(lines, owned, pricing, false), [lines, owned, pricing]);
  const withProxies = useMemo(() => ownershipShortfall(lines, owned, pricing, true), [lines, owned, pricing]);
  const proxied = lines.reduce((a, l) => a + Math.min(l.proxyQuantity, l.quantity), 0);
  const plan = includeProxies ? withProxies : withoutProxies;
  const copies = plan.reduce((a, s) => a + s.add, 0);
  const total = plan.reduce((a, s) => a + (s.unit ?? 0) * s.add, 0);
  const unpriced = plan.filter((s) => s.unit == null).length;

  if (!withProxies.length && !proxied && !result) return null;

  if (!open) {
    const more = withProxies.length > 0 || proxied > 0;
    return (
      <div className="mt-3 border-t border-rule pt-3">
        {result?.ok && (
          <p role="status" className="mb-2 text-xs text-gain" data-testid="mark-owned-result">
            {result.text}{" "}
            {result.orderId && (
              <Link href={`/collection/orders/${result.orderId}`} className="text-quill hover:underline">
                View or undo
              </Link>
            )}
          </p>
        )}
        {more && (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setResult(null);
                setOpen(true);
              }}
              data-testid="mark-owned"
            >
              <CheckCheck size={14} aria-hidden /> I own all of these
            </Button>
            <p className="mt-1 text-xs text-ink-3">
              {withoutProxies.length ? "Adds the copies you\u2019re missing to your collection in one go." : `Only proxied copies are left (${proxied}).`}
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3 border-t border-rule pt-3" data-testid="mark-owned-panel">
      <p className="text-sm">
        Add <span className="num font-medium">{copies}</span> {copies === 1 ? "copy" : "copies"} of <span className="num font-medium">{plan.length}</span> {plan.length === 1 ? "card" : "cards"} to your collection
        {includeProxies && proxied > 0 ? " and clear the proxy marks" : ""}.
      </p>
      {plan.length > 0 && (
        <ul className="max-h-40 space-y-0.5 overflow-y-auto text-xs text-ink-2">
          {plan.map((s) => (
            <li key={s.cardId} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">
                <span className="num">{s.add}×</span> {names.get(s.cardId) ?? "?"}
              </span>
              <span className="num shrink-0 text-ink-3">{cost === "market" ? (s.unit != null ? formatMoney(s.unit * s.add, currency) : "no price") : "—"}</span>
            </li>
          ))}
        </ul>
      )}
      {proxied > 0 && (
        <label className="flex items-start gap-2 text-xs">
          <input type="checkbox" className="mt-0.5" checked={includeProxies} onChange={(e) => setIncludeProxies(e.target.checked)} />
          <span>
            I also have the real cards for the <span className="num">{proxied}</span> proxied {proxied === 1 ? "copy" : "copies"}
          </span>
        </label>
      )}
      <Segmented
        label="Cost basis"
        name={`mo-cost-${deckId}`}
        value={cost}
        onChange={setCost}
        options={[
          { value: "market", label: `Market · ${formatMoney(total, currency)}` },
          { value: "zero", label: "Don't record" },
        ]}
      />
      {cost === "market" && unpriced > 0 && <p className="text-xs text-caution">{unpriced} without a price will cost 0.</p>}
      <TextField label="Owned since" type="date" value={acquiredOn} max={today} onChange={(e) => setAcquiredOn(e.target.value)} />
      <p className="text-xs text-ink-3">Each card is added in the printing cost to complete uses (your chosen one, else the standard one), condition NM. It&rsquo;s saved as one order you can delete to undo.</p>
      {dirty && <p className="text-xs text-caution">Save the deck first — this uses the saved list.</p>}
      {result && !result.ok && (
        <p role="alert" className="text-xs text-loss">
          {result.text}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || dirty || (!plan.length && !(includeProxies && proxied))}
          onClick={() =>
            start(async () => {
              const r = await markDeckOwned({ deckId, includeProxies, cost, acquiredOn });
              if (r.ok) {
                setResult({ ok: true, text: r.message ?? `Added ${r.data.copies} ${r.data.copies === 1 ? "copy" : "copies"} of ${r.data.cards} ${r.data.cards === 1 ? "card" : "cards"} to your collection.`, orderId: r.data.orderId });
                setOpen(false);
                router.refresh();
              } else setResult({ ok: false, text: r.message });
            })
          }
          data-testid="mark-owned-confirm"
        >
          {pending ? "Adding…" : `Add ${copies} to collection`}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
