"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { consumeFifo } from "@/lib/money/fifo";
import { formatMoney, parseMoneyInput } from "@/lib/money/money";
import { CURRENCIES, type Currency } from "@/lib/domain/enums";
import { MoneyField, Segmented, TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/Button";
import { recordSale } from "../actions";

interface LotRow {
  id: string;
  quantity: number;
  remainingQuantity: number;
  landedTotal: number;
  currency: string;
  acquiredOn: string;
  acquiredDay: string;
}

export function SaleForm({
  variantId,
  today,
  lots,
  defaultCurrency,
  marketHint,
}: {
  variantId: string;
  today: string;
  lots: LotRow[];
  defaultCurrency: string;
  marketHint: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [soldOn, setSoldOn] = useState(today);
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [fees, setFees] = useState("");
  const [currency, setCurrency] = useState<Currency>((CURRENCIES as readonly string[]).includes(defaultCurrency) ? (defaultCurrency as Currency) : "THB");
  const [buyer, setBuyer] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const eligible = lots.filter((l) => l.acquiredDay <= soldOn);
  const available = eligible.reduce((a, l) => a + l.remainingQuantity, 0);
  const qty = Number(quantity);
  const price = parseMoneyInput(unitPrice);
  const fee = fees.trim() ? parseMoneyInput(fees) : 0;

  const preview = useMemo(() => {
    if (!Number.isInteger(qty) || qty < 1 || qty > available) return null;
    const alloc = consumeFifo(
      eligible.map((l) => ({ ...l, acquiredOn: new Date(l.acquiredOn) })),
      qty,
    );
    const cost = alloc.reduce((a, x) => a + x.costBasis, 0);
    const lotCurrency = eligible[0]?.currency;
    const mixed = eligible.some((l) => l.currency !== lotCurrency);
    return { alloc, cost, lotCurrency, mixed };
  }, [qty, available, eligible]);

  const proceeds = price != null && fee != null && Number.isInteger(qty) ? qty * price - fee : null;
  const canComparePL = preview && !preview.mixed && preview.lotCurrency === currency && proceeds != null;

  function submit() {
    const errs: Record<string, string> = {};
    if (!Number.isInteger(qty) || qty < 1) errs.quantity = "Whole number, 1 or more";
    else if (qty > available) errs.quantity = `You hold ${available} on that date`;
    if (price == null) errs.unitPrice = "Enter a price, e.g. 20.00";
    if (fee == null) errs.fees = "Enter an amount like 4.00";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    start(async () => {
      const r = await recordSale({ variantId, quantity: qty, unitPrice: price!, fees: fee!, currency, soldOn, buyer: buyer || undefined });
      if (r.ok) router.push("/collection/orders?sold=1");
      else {
        setErrors(r.fieldErrors ?? {});
        setFormError(r.message);
      }
    });
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-5 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4 sm:p-5"
    >
      <div className="grid gap-4 sm:grid-cols-[160px_96px_minmax(0,1fr)]">
        <TextField label="Date sold" type="date" value={soldOn} max={today} onChange={(e) => setSoldOn(e.target.value)} />
        <TextField label="Qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} error={errors.quantity} hint={`${available} held`} />
        <Segmented label="Currency" name="sale-currency" value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <MoneyField
          label="Price each"
          currency={currency}
          value={unitPrice}
          onChange={setUnitPrice}
          error={errors.unitPrice}
          hint={marketHint != null ? `TCGplayer market ${formatMoney(marketHint, "USD")}` : undefined}
        />
        <MoneyField label="Fees" optional currency={currency} value={fees} onChange={setFees} error={errors.fees} hint="Marketplace, payment, postage" />
        <TextField label="Buyer" optional value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="Name or platform" />
      </div>

      {preview && (
        <div className="rounded-[var(--radius-control)] bg-inset px-4 py-3 text-sm" aria-live="polite">
          <p className="eyebrow mb-2">FIFO — copies sold from</p>
          <ul className="space-y-1">
            {preview.alloc.map((a) => {
              const lot = lots.find((l) => l.id === a.lotId)!;
              return (
                <li key={a.lotId} className="num flex justify-between text-ink-2">
                  <span>
                    {a.quantity}× bought {lot.acquiredDay}
                  </span>
                  <span>cost {formatMoney(a.costBasis, lot.currency)}</span>
                </li>
              );
            })}
          </ul>
          {canComparePL && (
            <p className="num mt-2 flex justify-between border-t border-rule pt-2 font-medium">
              <span>Realized gain / loss</span>
              <span className={proceeds! - preview.cost >= 0 ? "text-gain" : "text-loss"}>
                {proceeds! - preview.cost >= 0 ? "▲" : "▼"} {formatMoney(proceeds! - preview.cost, currency, { sign: true })}
              </span>
            </p>
          )}
          {preview && !canComparePL && proceeds != null && (
            <p className="mt-2 text-xs text-ink-3">These copies were bought in {preview.lotCurrency}; gain/loss is converted on the dashboard.</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Record sale"}
        </Button>
        {formError && (
          <p role="alert" className="text-sm text-loss">
            {formError}
          </p>
        )}
      </div>
    </form>
  );
}
