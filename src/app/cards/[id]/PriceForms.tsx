"use client";

import { useState, useTransition } from "react";
import { MoneyField, Segmented, TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/Button";
import { parseMoneyInput } from "@/lib/money/money";
import { CURRENCIES, type Currency } from "@/lib/domain/enums";
import { clearManualPrice, reportLocalPrice, setManualPrice, moveLot, removeCopies } from "@/app/collection/actions";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
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

/** Which binder (or other storage) these copies are in. "No binder" takes them out of it but keeps them. */
export function MoveLotSelect({ lotId, current, locations }: { lotId: string; current: string | null; locations: { id: string; name: string }[] }) {
  const [value, setValue] = useState(current ?? "");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-ink-3">
      <span>Binder</span>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          setSaved(false);
          start(async () => {
            const r = await moveLot(lotId, v || null);
            setSaved(r.ok);
          });
        }}
        className="h-7 max-w-44 rounded-[var(--radius-control)] border border-rule bg-inset px-2 text-xs text-ink-2 hover:border-rule-strong focus:border-quill focus:outline-none"
        data-testid="lot-binder"
      >
        <option value="">No binder</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      {pending ? <span>Moving…</span> : saved ? <span className="text-gain">{value ? "Moved" : "Taken out of the binder"}</span> : null}
    </label>
  );
}

/** "Remove": takes unsold copies out of your collection (not a sale — that's "Record sale"). */
export function RemoveCopies({ lotId, remaining, label }: { lotId: string; remaining: number; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(remaining);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open)
    return (
      <button
        type="button"
        onClick={() => {
          setN(remaining);
          setMsg(null);
          setOpen(true);
        }}
        className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-control)] px-2 text-xs text-ink-3 hover:bg-loss-tint hover:text-loss"
        data-testid="lot-remove"
      >
        <Trash2 size={13} aria-hidden /> Remove
      </button>
    );
  return (
    <div className="mt-2 flex basis-full flex-wrap items-center gap-2 rounded-[var(--radius-control)] border border-loss/30 bg-loss-tint/40 px-3 py-2 text-xs" role="group" aria-label={`Remove ${label}`} data-testid="lot-remove-panel">
      <span className="text-ink">Remove</span>
      {remaining > 1 ? (
        <span className="inline-flex items-center rounded-[var(--radius-control)] border border-rule bg-sheet">
          <button type="button" className="grid size-7 place-items-center text-ink-2 hover:bg-hover disabled:opacity-40" disabled={n <= 1} onClick={() => setN((x) => Math.max(1, x - 1))} aria-label="Remove one fewer">
            <Minus size={12} />
          </button>
          <span className="num w-7 text-center font-semibold" aria-live="polite" data-testid="lot-remove-qty">
            {n}
          </span>
          <button type="button" className="grid size-7 place-items-center text-ink-2 hover:bg-hover disabled:opacity-40" disabled={n >= remaining} onClick={() => setN((x) => Math.min(remaining, x + 1))} aria-label="Remove one more">
            <Plus size={12} />
          </button>
        </span>
      ) : (
        <span className="num font-semibold">1</span>
      )}
      <span className="text-ink-2">
        of {remaining} from your collection? Not a sale — use Record sale if you sold {remaining === 1 ? "it" : "them"}.
      </span>
      <span className="ml-auto flex gap-1.5">
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await removeCopies({ lotId, quantity: n });
              if (r.ok) {
                setOpen(false);
                router.refresh();
              } else setMsg(r.message);
            })
          }
          data-testid="lot-remove-confirm"
        >
          {pending ? "Removing…" : `Remove ${n}`}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Keep
        </Button>
      </span>
      {msg && (
        <p role="alert" className="basis-full text-loss">
          {msg}
        </p>
      )}
    </div>
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
