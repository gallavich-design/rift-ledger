"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { MoneyField, Segmented, TextField } from "@/components/ui/fields";
import { parseMoneyInput } from "@/lib/money/money";
import { CURRENCIES, type Currency } from "@/lib/domain/enums";
import { cn } from "@/lib/ui";
import { removeWatch, saveWatch } from "@/app/watchlist/actions";

interface Existing {
  targetPrice: number | null;
  targetDir: string | null;
  movePct: number | null;
  currency: string | null;
  preorderPrice: number | null;
}

export function WatchForm({ variantId, existing, defaultCurrency, deck, showPreorder }: { variantId: string; existing: Existing | null; defaultCurrency: string; deck: { id: string; name: string } | null; showPreorder: boolean }) {
  const [currency, setCurrency] = useState<Currency>(((existing?.currency ?? defaultCurrency) as Currency) || "THB");
  const [target, setTarget] = useState(existing?.targetPrice != null ? (existing.targetPrice / 100).toFixed(2) : "");
  const [dir, setDir] = useState<"BELOW" | "ABOVE">((existing?.targetDir as "BELOW" | "ABOVE") ?? "BELOW");
  const [move, setMove] = useState(existing?.movePct != null ? String(existing.movePct) : "");
  const [pre, setPre] = useState(existing?.preorderPrice != null ? (existing.preorderPrice / 100).toFixed(2) : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      noValidate
      className="space-y-3"
      aria-label="Watch this printing"
      onSubmit={(e) => {
        e.preventDefault();
        const t = target.trim() ? parseMoneyInput(target) : null;
        const p = pre.trim() ? parseMoneyInput(pre) : null;
        const m = move.trim() ? Number(move) : null;
        const errs: Record<string, string> = {};
        if (target.trim() && (t == null || t <= 0)) errs.targetPrice = "Enter a price like 500";
        if (pre.trim() && (p == null || p <= 0)) errs.preorderPrice = "Enter a price like 500";
        if (move.trim() && (!Number.isInteger(m) || m! < 1 || m! > 100)) errs.movePct = "Whole number 1–100";
        setErrors(errs);
        if (Object.keys(errs).length) return;
        start(async () => {
          const r = await saveWatch({ variantId, targetPrice: t, targetDir: dir, movePct: m, currency, preorderPrice: p, deckId: deck?.id ?? null });
          setErrors(r.ok ? {} : (r.fieldErrors ?? {}));
          setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "") : r.message });
        });
      }}
    >
      {deck && <p className="text-xs text-ink-3">For {deck.name} — you&apos;ll get a “card your deck needs” alert.</p>}
      <div className="flex flex-wrap items-end gap-3">
        <Segmented label="Alert when the price is" name={`dir-${variantId}`} value={dir} onChange={setDir} options={[{ value: "BELOW", label: "at or below" }, { value: "ABOVE", label: "at or above" }]} />
        <MoneyField label="Target" currency={currency} value={target} onChange={setTarget} error={errors.targetPrice} className="w-32" />
        <Segmented label="Currency" hideLabel name={`wc-${variantId}`} value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <TextField label="…or moves ±%" inputMode="numeric" value={move} onChange={(e) => setMove(e.target.value)} error={errors.movePct} hint="in 7 days" className="num w-32" optional />
        {showPreorder && <MoneyField label="Pre-order price" optional currency={currency} value={pre} onChange={setPre} error={errors.preorderPrice} className="w-36" hint="what you paid or saw" />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : existing ? "Update watch" : "Watch"}
        </Button>
        {existing && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await removeWatch(variantId);
                setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "") : r.message });
              })
            }
          >
            Stop watching
          </Button>
        )}
        {msg && (
          <p role="status" className={cn("text-sm", msg.ok ? "text-gain" : "text-loss")}>
            {msg.text}
          </p>
        )}
      </div>
    </form>
  );
}
