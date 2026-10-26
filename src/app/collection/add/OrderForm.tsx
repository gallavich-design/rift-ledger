"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { VariantPicker, variantLabel, type PickedVariant } from "@/components/cards/VariantPicker";
import { MoneyField, Segmented, SelectField, TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/Button";
import { allocateLandedCost } from "@/lib/money/landedCost";
import { formatMoney, parseMoneyInput } from "@/lib/money/money";
import { CONDITIONS, CURRENCIES, type Currency } from "@/lib/domain/enums";

import { createOrder } from "../actions";

interface Line {
  key: string;
  variant: PickedVariant | null;
  quantity: string;
  unitPrice: string;
  condition: string;
  storageLocationId: string;
}

const SELLERS = ["TCGplayer", "Facebook group", "Local shop", "Shopee", "Lazada", "Friend / trade"];
let seq = 0;
const newLine = (variant: PickedVariant | null = null, storageLocationId = ""): Line => ({
  key: `l${++seq}`,
  variant,
  quantity: "1",
  unitPrice: "",
  condition: "NM",
  storageLocationId,
});

export function OrderForm({
  locations,
  today,
  defaultCurrency,
  initialVariant,
}: {
  locations: { id: string; name: string }[];
  today: string;
  defaultCurrency: Currency;
  initialVariant: PickedVariant | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [orderedOn, setOrderedOn] = useState(today);
  const [seller, setSeller] = useState("");
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);
  const [lines, setLines] = useState<Line[]>(() => [newLine(initialVariant)]);
  const [extras, setExtras] = useState({ shipping: "", forwardingFee: "", importTax: "", otherFees: "" });
  const [showExtras, setShowExtras] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const parsedExtras = Object.fromEntries(Object.entries(extras).map(([k, v]) => [k, v.trim() ? parseMoneyInput(v) : 0])) as Record<keyof typeof extras, number | null>;
  const extrasTotal = Object.values(parsedExtras).reduce<number>((a, v) => a + (v ?? 0), 0);

  const preview = useMemo(() => {
    const ok = lines.every((l) => l.variant && parseMoneyInput(l.unitPrice) != null && Number(l.quantity) >= 1 && Number.isInteger(Number(l.quantity)));
    if (!ok || Object.values(parsedExtras).some((v) => v == null)) return null;
    try {
      return allocateLandedCost(
        lines.map((l) => ({ key: l.key, quantity: Number(l.quantity), unitPrice: parseMoneyInput(l.unitPrice)! })),
        extrasTotal,
      );
    } catch {
      return null;
    }
  }, [lines, parsedExtras, extrasTotal]);

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function submit() {
    const errs: Record<string, string> = {};
    if (!seller.trim()) errs.seller = "Who did you buy from?";
    lines.forEach((l, i) => {
      if (!l.variant) errs[`lines.${i}.variantId`] = "Pick a card";
      if (!(Number(l.quantity) >= 1) || !Number.isInteger(Number(l.quantity))) errs[`lines.${i}.quantity`] = "Whole number, 1 or more";
      if (parseMoneyInput(l.unitPrice) == null) errs[`lines.${i}.unitPrice`] = "Enter a price, e.g. 12.50";
    });
    for (const [k, v] of Object.entries(parsedExtras)) if (v == null) errs[k] = "Enter an amount like 5.00";
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFormError("Check the highlighted fields.");
      return;
    }
    setFormError(null);
    start(async () => {
      const r = await createOrder({
        orderedOn,
        seller,
        currency,
        shipping: parsedExtras.shipping ?? 0,
        forwardingFee: parsedExtras.forwardingFee ?? 0,
        importTax: parsedExtras.importTax ?? 0,
        otherFees: parsedExtras.otherFees ?? 0,
        lines: lines.map((l) => ({
          variantId: l.variant!.id,
          quantity: Number(l.quantity),
          unitPrice: parseMoneyInput(l.unitPrice)!,
          condition: l.condition as (typeof CONDITIONS)[number],
          storageLocationId: l.storageLocationId || null,
        })),
      });
      if (r.ok) router.push(`/collection/orders/${r.data.orderId}?saved=1`);
      else {
        setErrors(r.fieldErrors ?? {});
        setFormError(r.message);
      }
    });
  }

  const subtotal = lines.reduce((a, l) => a + (parseMoneyInput(l.unitPrice) ?? 0) * (Number(l.quantity) || 0), 0);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
      }}
      className="space-y-6"
    >
      <section className="rounded-[var(--radius-panel)] border border-rule bg-sheet p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)_auto]">
          <TextField label="Date" type="date" value={orderedOn} max={today} onChange={(e) => setOrderedOn(e.target.value)} error={errors.orderedOn} />
          <div>
            <TextField label="Bought from" list="sellers" value={seller} onChange={(e) => setSeller(e.target.value)} placeholder="TCGplayer, Facebook group…" error={errors.seller} />
            <datalist id="sellers">
              {SELLERS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <Segmented label="Paid in" name="currency" value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </div>
      </section>

      <section aria-labelledby="lines-h">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="lines-h" className="text-base font-semibold">
            Cards
          </h2>
          <span className="text-xs text-ink-3">
            <kbd className="num">⌘↵</kbd> saves
          </span>
        </div>
        <ol className="space-y-3">
          {lines.map((l, i) => {
            const landed = preview?.find((p) => p.key === l.key);
            return (
              <li key={l.key} className="rounded-[var(--radius-panel)] border border-rule bg-sheet p-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_72px_120px]">
                  <VariantPicker value={l.variant} onChange={(v) => update(l.key, { variant: v })} error={errors[`lines.${i}.variantId`]} autoFocus={i > 0 || !initialVariant} label={`Card ${lines.length > 1 ? i + 1 : ""}`.trim()} />
                  <TextField label="Qty" inputMode="numeric" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} error={errors[`lines.${i}.quantity`]} className="num" />
                  <MoneyField label="Price each" currency={currency} value={l.unitPrice} onChange={(v) => update(l.key, { unitPrice: v })} error={errors[`lines.${i}.unitPrice`]} />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-end">
                  <SelectField label="Condition" value={l.condition} onChange={(e) => update(l.key, { condition: e.target.value })} options={CONDITIONS.map((c) => ({ value: c, label: c }))} />
                  <SelectField
                    label="Stored in"
                    value={l.storageLocationId}
                    onChange={(e) => update(l.key, { storageLocationId: e.target.value })}
                    options={[{ value: "", label: "Unassigned" }, ...locations.map((x) => ({ value: x.id, label: x.name }))]}
                  />
                  {lines.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`Remove card ${i + 1}`}>
                      <Trash2 size={14} aria-hidden /> Remove
                    </Button>
                  )}
                </div>
                {l.variant?.tcgMarket != null && (
                  <p className="mt-2 text-xs text-ink-3">
                    TCGplayer market <span className="num">{formatMoney(l.variant.tcgMarket, "USD")}</span> on <span className="num">{l.variant.tcgDay}</span>
                  </p>
                )}
                {landed && extrasTotal > 0 && (
                  <p className="mt-2 text-xs text-ink-2">
                    Landed <span className="num font-medium text-ink">{formatMoney(Math.floor(landed.landedTotal / Number(l.quantity)), currency)}</span> each
                    {Number(l.quantity) > 1 && (
                      <>
                        {" "}
                        · <span className="num">{formatMoney(landed.landedTotal, currency)}</span> total
                      </>
                    )}{" "}
                    (+<span className="num">{formatMoney(landed.allocatedExtras, currency)}</span> of extras)
                  </p>
                )}
              </li>
            );
          })}
        </ol>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => setLines((ls) => [...ls, newLine(null, ls[ls.length - 1]?.storageLocationId ?? "")])}
        >
          <Plus size={15} aria-hidden /> Add another card
        </Button>
      </section>

      <section className="rounded-[var(--radius-panel)] border border-rule bg-sheet">
        <button
          type="button"
          onClick={() => setShowExtras((s) => !s)}
          aria-expanded={showExtras}
          className="flex w-full items-center justify-between px-4 py-3 text-left sm:px-5"
        >
          <span>
            <span className="text-base font-semibold">Shipping, forwarding &amp; tax</span>
            <span className="block text-xs text-ink-3">Spread across the cards by value to give each its landed cost.</span>
          </span>
          <span className="num text-sm text-ink-2">{extrasTotal ? formatMoney(extrasTotal, currency) : showExtras ? "" : "Add"}</span>
        </button>
        {showExtras && (
          <div className="grid gap-3 border-t border-rule px-4 py-4 sm:grid-cols-4 sm:px-5">
            {(
              [
                ["shipping", "Shipping to forwarder"],
                ["forwardingFee", "Forwarding fee"],
                ["importTax", "Import duty / tax"],
                ["otherFees", "Other fees"],
              ] as const
            ).map(([k, label]) => (
              <MoneyField key={k} label={label} currency={currency} value={extras[k]} onChange={(v) => setExtras((x) => ({ ...x, [k]: v }))} error={errors[k]} />
            ))}
          </div>
        )}
      </section>

      <div className="sticky bottom-16 z-10 -mx-4 border-t border-rule bg-paper/95 px-4 py-3 backdrop-blur md:bottom-0 md:mx-0 md:rounded-[var(--radius-panel)] md:border md:bg-sheet md:px-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <dl className="flex flex-1 flex-wrap gap-x-6 gap-y-1 text-sm">
            <div>
              <dt className="eyebrow">Items</dt>
              <dd className="num">{formatMoney(subtotal, currency)}</dd>
            </div>
            <div>
              <dt className="eyebrow">Extras</dt>
              <dd className="num">{formatMoney(extrasTotal, currency)}</dd>
            </div>
            <div>
              <dt className="eyebrow">Landed total</dt>
              <dd className="num font-medium">{formatMoney(subtotal + extrasTotal, currency)}</dd>
            </div>
          </dl>
          {formError && (
            <p role="alert" className="text-sm text-loss">
              {formError}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : lines.length > 1 ? `Save order · ${lines.length} cards` : "Save purchase"}
          </Button>
        </div>
      </div>
      {preview && lines.length > 0 && <p className="sr-only">{lines.map((l) => (l.variant ? variantLabel(l.variant) : "")).join(", ")}</p>}
    </form>
  );
}

