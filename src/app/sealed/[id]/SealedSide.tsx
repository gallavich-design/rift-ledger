"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoneyField, Segmented } from "@/components/ui/fields";
import { Button } from "@/components/ui/Button";
import { CURRENCIES, type Currency } from "@/lib/domain/enums";
import { parseMoneyInput, formatMoney } from "@/lib/money/money";
import { deleteSealed, setSealedPrice } from "../actions";

export function SealedSide({ id, manualPrice, manualCurrency, canDelete }: { id: string; manualPrice: number | null; manualCurrency: string; canDelete: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [price, setPrice] = useState(manualPrice != null ? (manualPrice / 100).toFixed(2) : "");
  const [currency, setCurrency] = useState<Currency>(manualCurrency as Currency);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);

  function save(clear = false) {
    const p = clear ? null : parseMoneyInput(price);
    if (!clear && p == null) return setMsg({ ok: false, text: "Enter a price like 4500.00" });
    start(async () => {
      const r = await setSealedPrice({ id, price: p, currency });
      setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Saved") : r.message });
      if (r.ok && clear) setPrice("");
      router.refresh();
    });
  }

  return (
    <aside className="space-y-4">
      <section className="rounded-[var(--radius-panel)] border border-rule bg-sheet p-4" aria-labelledby="mp-h">
        <h2 id="mp-h" className="text-sm font-semibold">
          Manual price
        </h2>
        <p className="mt-1 text-xs text-ink-3">Overrides TCGplayer for this product — useful for local box prices.</p>
        <div className="mt-3 space-y-3">
          <Segmented label="Currency" name="mp-cur" value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          <MoneyField label="Price each" currency={currency} value={price} onChange={setPrice} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => save()} disabled={pending}>
              Save price
            </Button>
            {manualPrice != null && (
              <Button size="sm" variant="ghost" onClick={() => save(true)} disabled={pending}>
                Clear ({formatMoney(manualPrice, manualCurrency)})
              </Button>
            )}
          </div>
          {msg && (
            <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-xs text-gain" : "text-xs text-loss"}>
              {msg.text}
            </p>
          )}
        </div>
      </section>
      {canDelete && (
        <section className="rounded-[var(--radius-panel)] border border-rule bg-sheet p-4">
          {confirm ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Delete this product?</span>
              <Button
                size="sm"
                variant="danger"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await deleteSealed(id);
                    if (r.ok) router.push("/sealed");
                    else setMsg({ ok: false, text: r.message });
                  })
                }
              >
                Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                Keep
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
              Delete product
            </Button>
          )}
        </section>
      )}
    </aside>
  );
}
