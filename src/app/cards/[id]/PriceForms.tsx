"use client";

import { useState, useTransition } from "react";
import { MoneyField, Segmented, TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/Button";
import { parseMoneyInput } from "@/lib/money/money";
import { CURRENCIES, type Currency } from "@/lib/domain/enums";
import { clearManualPrice, reportLocalPrice, setManualPrice, moveLot } from "@/app/collection/actions";
import { cn } from "@/lib/ui";

const PLACES = ["Facebook group", "Local shop", "Shopee", "Lazada", "Discord", "Event / tournament"];

export function LocalPriceForm({ variantId, today, onDone }: { variantId: string; today: string; onDone?: () => void }) {
  const [price, setPrice] = useState("");
  const [where, setWhere] = useState("");
  const [seenOn, setSeenOn] = useState(today);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const p = parseMoneyInput(price);
        const errs: Record<string, string> = {};
        if (p == null || p <= 0) errs.price = "Enter a price in baht";
        if (!where.trim()) errs.whereSeen = "Where did you see it?";
        setErrors(errs);
        if (Object.keys(errs).length) return;
        start(async () => {
          const r = await reportLocalPrice({ variantId, price: p!, whereSeen: where, seenOn, note: note || undefined });
          if (r.ok) {
            setMsg({ ok: true, text: r.message ?? "Saved." });
            setPrice("");
            setNote("");
            onDone?.();
          } else {
            setErrors(r.fieldErrors ?? {});
            setMsg({ ok: false, text: r.message });
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[130px_minmax(0,1fr)_150px]">
        <MoneyField label="Price" currency="THB" value={price} onChange={setPrice} error={errors.price} />
        <div>
          <TextField label="Where" list="places" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Facebook group, shop name…" error={errors.whereSeen} />
          <datalist id="places">
            {PLACES.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <TextField label="Seen on" type="date" value={seenOn} max={today} onChange={(e) => setSeenOn(e.target.value)} error={errors.seenOn} />
      </div>
      <TextField label="Note" optional value={note} onChange={(e) => setNote(e.target.value)} placeholder="Condition, seller, asking vs sold…" />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save local price"}
        </Button>
        {msg && (
          <p role="status" className={cn("text-sm", msg.ok ? "text-gain" : "text-loss")}>
            {msg.text}
          </p>
        )}
      </div>
    </form>
  );
}

export function ManualPriceForm({ variantId, current, defaultCurrency }: { variantId: string; current: { amount: number; currency: string } | null; defaultCurrency: string }) {
  const [price, setPrice] = useState(current ? (current.amount / 100).toFixed(2) : "");
  const [currency, setCurrency] = useState<Currency>(((current?.currency ?? defaultCurrency) as Currency) || "THB");
  const [error, setError] = useState<string | undefined>();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const p = parseMoneyInput(price);
        if (p == null || p <= 0) {
          setError("Enter a price");
          return;
        }
        setError(undefined);
        start(async () => {
          const r = await setManualPrice({ variantId, price: p, currency });
          setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Saved.") : r.message });
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <MoneyField label="Your price" currency={currency} value={price} onChange={setPrice} error={error} className="w-36" />
        <Segmented label="Currency" hideLabel name={`mc-${variantId}`} value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : current ? "Update" : "Set override"}
        </Button>
        {current && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await clearManualPrice(variantId);
                setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "") : r.message });
                setPrice("");
              })
            }
          >
            Remove override
          </Button>
        )}
      </div>
      {msg && (
        <p role="status" className={cn("text-sm", msg.ok ? "text-gain" : "text-loss")}>
          {msg.text}
        </p>
      )}
    </form>
  );
}

export function MoveLotSelect({ lotId, current, locations }: { lotId: string; current: string | null; locations: { id: string; name: string }[] }) {
  const [value, setValue] = useState(current ?? "");
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-ink-3">
      <span className="sr-only">Stored in</span>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          start(async () => {
            await moveLot(lotId, v || null);
          });
        }}
        className="h-7 max-w-44 rounded-[var(--radius-control)] border border-rule bg-inset px-2 text-xs text-ink-2 hover:border-rule-strong focus:border-quill focus:outline-none"
      >
        <option value="">Unassigned</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      {pending && <span>Moving…</span>}
    </label>
  );
}

export function Disclosure({ label, children, defaultOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <Button variant="secondary" size="sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
      </Button>
      {open && <div className="mt-3 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4">{children}</div>}
    </div>
  );
}
