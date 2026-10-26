"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoneyField, Segmented, SelectField, TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/Button";
import { formatMoney, parseMoneyInput } from "@/lib/money/money";
import { CURRENCIES, SEALED_KINDS, SEALED_KIND_LABEL, guessSealedKind, type Currency, type SealedKind } from "@/lib/domain/enums";
import { addSealed } from "../actions";

interface Product {
  id: string;
  name: string;
  group: string;
  market: number | null;
  day: string | null;
}

export function SealedForm({ today, locations, defaultCurrency, products }: { today: string; locations: { id: string; name: string }[]; defaultCurrency: Currency; products: Product[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SealedKind>("BOOSTER_BOX");
  const [quantity, setQuantity] = useState("1");
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);
  const [unitPrice, setUnitPrice] = useState("");
  const [extras, setExtras] = useState("");
  const [acquiredOn, setAcquiredOn] = useState(today);
  const [loc, setLoc] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const product = products.find((p) => p.id === productId);
  const groups = useMemo(() => {
    const m = new Map<string, Product[]>();
    for (const p of products) m.set(p.group, [...(m.get(p.group) ?? []), p]);
    return [...m.entries()];
  }, [products]);

  const qty = Number(quantity);
  const price = parseMoneyInput(unitPrice);
  const ex = extras.trim() ? parseMoneyInput(extras) : 0;
  const landed = price != null && ex != null && qty >= 1 && Number.isInteger(qty) ? Math.round((price * qty + ex) / qty) : null;

  function pick(id: string) {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (p) {
      setName(p.name);
      setKind(guessSealedKind(p.name));
    }
  }

  function submit() {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name the product";
    if (!(qty >= 1) || !Number.isInteger(qty)) errs.quantity = "Whole number, 1 or more";
    if (price == null) errs.unitPrice = "Enter a price, e.g. 4500.00";
    if (ex == null) errs.extras = "Enter an amount like 150.00";
    setErrors(errs);
    if (Object.keys(errs).length) return setFormError("Check the highlighted fields.");
    setFormError(null);
    start(async () => {
      const r = await addSealed({ name, kind, tcgplayerId: productId || null, quantity: qty, unitPrice: price!, extras: ex!, currency, acquiredOn, storageLocationId: loc || null });
      if (r.ok) router.push(`/sealed/${r.data.id}?saved=1`);
      else {
        setErrors(r.fieldErrors ?? {});
        setFormError(r.message);
      }
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
      <section className="space-y-4 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4 sm:p-5">
        <div>
          <label htmlFor="tcg-product" className="mb-1.5 block text-sm font-medium">
            TCGplayer product <span className="font-normal text-ink-3">(for daily prices)</span>
          </label>
          <select
            id="tcg-product"
            value={productId}
            onChange={(e) => pick(e.target.value)}
            className="h-10 w-full rounded-[var(--radius-control)] border border-rule bg-sheet px-3 text-sm focus:border-quill focus:outline-none"
          >
            <option value="">Not on TCGplayer / enter a name</option>
            {groups.map(([g, ps]) => (
              <optgroup key={g} label={g}>
                {ps.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.market != null ? ` — ${formatMoney(p.market, "USD")}` : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {product && (
            <p className="mt-1.5 text-xs text-ink-3">
              {product.market != null ? (
                <>
                  TCGplayer market <span className="num">{formatMoney(product.market, "USD")}</span> on <span className="num">{product.day}</span>
                </>
              ) : (
                "No TCGplayer price yet — you can set a manual price after saving."
              )}
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Spiritforged Booster Display" />
          <SelectField label="Kind" value={kind} onChange={(e) => setKind(e.target.value as SealedKind)} options={SEALED_KINDS.map((k) => ({ value: k, label: SEALED_KIND_LABEL[k] }))} />
        </div>
      </section>

      <section className="space-y-4 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
          <TextField label="Bought on" type="date" value={acquiredOn} max={today} onChange={(e) => setAcquiredOn(e.target.value)} error={errors.acquiredOn} />
          <Segmented label="Paid in" name="currency" value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </div>
        <div className="grid gap-4 sm:grid-cols-[80px_minmax(0,1fr)_minmax(0,1fr)]">
          <TextField label="Qty" inputMode="numeric" className="num" value={quantity} onChange={(e) => setQuantity(e.target.value)} error={errors.quantity} />
          <MoneyField label="Price each" currency={currency} value={unitPrice} onChange={setUnitPrice} error={errors.unitPrice} />
          <MoneyField label="Shipping, forwarding & tax" optional currency={currency} value={extras} onChange={setExtras} error={errors.extras} hint="For the whole purchase" />
        </div>
        <SelectField label="Stored in" value={loc} onChange={(e) => setLoc(e.target.value)} options={[{ value: "", label: "Unassigned" }, ...locations.map((l) => ({ value: l.id, label: l.name }))]} />
      </section>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[var(--radius-panel)] border border-rule bg-sheet px-4 py-3 sm:px-5">
        <dl className="flex-1 text-sm">
          <dt className="eyebrow">Landed cost each</dt>
          <dd className="num font-medium" data-testid="sealed-landed">
            {landed != null ? formatMoney(landed, currency) : "—"}
          </dd>
        </dl>
        {formError && (
          <p role="alert" className="text-sm text-loss">
            {formError}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save sealed product"}
        </Button>
      </div>
    </form>
  );
}
