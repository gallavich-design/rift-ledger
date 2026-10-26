"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Segmented, SelectField, TextField } from "@/components/ui/fields";
import { cn } from "@/lib/ui";
import { addRuling } from "../actions";

type T = "ERRATA" | "BAN" | "UNBAN" | "ROTATION";

export function RulingForm({ today, sets }: { today: string; sets: { code: string; name: string }[] }) {
  const router = useRouter();
  const [type, setType] = useState<T>("ERRATA");
  const [title, setTitle] = useState("");
  const [effectiveOn, setEffectiveOn] = useState(today);
  const [summary, setSummary] = useState("");
  const [oldText, setOldText] = useState("");
  const [newText, setNewText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [setCode, setSetCode] = useState("");
  const [cards, setCards] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; type: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((r) => setHits(r.cards ?? []))
        .catch(() => {});
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  // Prefill the old text from the card's current rules text for errata.
  async function addCard(c: { id: string; name: string }) {
    if (!cards.some((x) => x.id === c.id)) setCards((cs) => [...cs, c]);
    setQ("");
    setHits([]);
    if (type === "ERRATA" && !oldText) {
      const r = await fetch(`/api/cards/${c.id}/text`).then((r) => (r.ok ? r.json() : null));
      if (r?.text) {
        setOldText(r.text);
        if (!newText) setNewText(r.text);
      }
    }
  }

  return (
    <form
      noValidate
      className="space-y-5 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addRuling({ type, title, effectiveOn, summary, oldText, newText, sourceUrl, setCode: type === "ROTATION" ? setCode : undefined, cardIds: cards.map((c) => c.id) });
          if (r.ok) router.push(`/news/${r.data.rulingId}?saved=${r.data.alerts}`);
          else {
            setErrors(r.fieldErrors ?? {});
            setMsg(r.message);
          }
        });
      }}
    >
      <Segmented
        label="Type"
        name="ruling-type"
        value={type}
        onChange={setType}
        options={[
          { value: "ERRATA", label: "Errata" },
          { value: "BAN", label: "Ban" },
          { value: "UNBAN", label: "Unban" },
          { value: "ROTATION", label: "Rotation" },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_170px]">
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder={type === "ROTATION" ? "e.g. Standard rotation 2028" : "e.g. October 2026 ban list"} />
        <TextField label="Takes effect" type="date" value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} error={errors.effectiveOn} />
      </div>

      {type === "ROTATION" ? (
        <SelectField
          label="Set leaving Standard"
          value={setCode}
          onChange={(e) => setSetCode(e.target.value)}
          error={errors.setCode}
          options={[{ value: "", label: "Choose a set…" }, ...sets.map((s) => ({ value: s.code, label: `${s.code} — ${s.name}` }))]}
        />
      ) : (
        <div>
          <label htmlFor="ruling-card" className="mb-1.5 block text-sm font-medium">
            Cards
          </label>
          {cards.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {cards.map((c) => (
                <li key={c.id} className="inline-flex items-center gap-1 rounded-full border border-rule bg-inset py-1 pr-1 pl-3 text-sm">
                  {c.name}
                  <button type="button" onClick={() => setCards((cs) => cs.filter((x) => x.id !== c.id))} aria-label={`Remove ${c.name}`} className="grid size-5 place-items-center rounded-full text-ink-3 hover:bg-hover">
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
            <input
              id="ruling-card"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && hits[0]) {
                  e.preventDefault();
                  addCard(hits[0]);
                }
              }}
              placeholder="Type a card name"
              autoComplete="off"
              aria-invalid={!!errors.cardIds}
              className={cn("h-10 w-full rounded-[var(--radius-control)] border bg-inset pr-3 pl-9 text-[15px] placeholder:text-ink-4 focus:border-quill focus:bg-sheet focus:outline-none", errors.cardIds ? "border-loss" : "border-rule")}
            />
            {hits.length > 0 && (
              <ul role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-[var(--radius-control)] border border-rule-strong bg-sheet py-1 shadow-[0_12px_32px_-12px_rgba(22,24,29,0.25)]">
                {hits.map((h) => (
                  <li key={h.id} role="option" aria-selected={false}>
                    <button type="button" onClick={() => addCard(h)} className="flex w-full justify-between px-3 py-1.5 text-left text-sm hover:bg-hover">
                      <span>{h.name}</span>
                      <span className="text-xs text-ink-3">{h.type}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {errors.cardIds && <p className="mt-1 text-sm text-loss">{errors.cardIds}</p>}
        </div>
      )}

      {type === "ERRATA" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextArea label="Old text" value={oldText} onChange={setOldText} hint="Filled from the card when you pick it." />
          <TextArea label="New text" value={newText} onChange={setNewText} error={errors.newText} />
        </div>
      )}
      <TextArea label="Summary" value={summary} onChange={setSummary} optional rows={3} />
      <TextField label="Source link" optional type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" error={errors.sourceUrl} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save ruling"}
        </Button>
        {msg && (
          <p role="alert" className="text-sm text-loss">
            {msg}
          </p>
        )}
      </div>
    </form>
  );
}

function TextArea({ label, value, onChange, error, hint, optional, rows = 5 }: { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; optional?: boolean; rows?: number }) {
  const id = `ta-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label} {optional && <span className="font-normal text-ink-3">(optional)</span>}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        className={cn("w-full rounded-[var(--radius-control)] border bg-inset px-3 py-2 text-sm leading-relaxed focus:border-quill focus:bg-sheet focus:outline-none", error ? "border-loss" : "border-rule")}
      />
      {error ? <p className="mt-1 text-sm text-loss">{error}</p> : hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}
