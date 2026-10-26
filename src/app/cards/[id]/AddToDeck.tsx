"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui";
import { addCardToDeck } from "@/app/decks/actions";

export function AddToDeck({ cardId, decks }: { cardId: string; decks: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [deckId, setDeckId] = useState(decks[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; deckId?: string } | null>(null);
  const [pending, start] = useTransition();

  if (!decks.length)
    return (
      <Button asChild variant="secondary">
        <Link href="/decks/new">Add to deck</Link>
      </Button>
    );
  return (
    <div className="relative">
      <Button variant="secondary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Add to deck
      </Button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-72 rounded-[var(--radius-panel)] border border-rule-strong bg-sheet p-3 shadow-[0_12px_32px_-12px_rgba(22,24,29,0.25)]">
          <label className="block text-xs font-medium text-ink-2" htmlFor="atd-deck">
            Deck
          </label>
          <select id="atd-deck" value={deckId} onChange={(e) => setDeckId(e.target.value)} className="mt-1 h-9 w-full rounded-[var(--radius-control)] border border-rule bg-inset px-2 text-sm focus:border-quill focus:outline-none">
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <fieldset className="mt-3">
            <legend className="text-xs font-medium text-ink-2">Copies</legend>
            <div className="mt-1 inline-flex rounded-[var(--radius-control)] border border-rule bg-inset p-0.5">
              {[1, 2, 3].map((n) => (
                <label key={n} className="cursor-pointer">
                  <input type="radio" name="atd-qty" checked={qty === n} onChange={() => setQty(n)} className="peer sr-only" />
                  <span className="num inline-flex h-7 w-9 items-center justify-center rounded-[3px] text-[13px] text-ink-2 peer-checked:bg-sheet peer-checked:font-medium peer-checked:text-ink peer-checked:shadow-[0_0_0_1px_var(--rule)] peer-focus-visible:outline-2 peer-focus-visible:outline-quill">
                    {n}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              disabled={pending || !deckId}
              onClick={() =>
                start(async () => {
                  const r = await addCardToDeck({ deckId, cardId, quantity: qty });
                  setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Added.") : r.message, deckId });
                })
              }
            >
              {pending ? "Adding…" : "Add"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
          {msg && (
            <p role="status" className={cn("mt-2 text-xs", msg.ok ? "text-gain" : "text-loss")}>
              {msg.text}{" "}
              {msg.ok && msg.deckId && (
                <Link href={`/decks/${msg.deckId}`} className="underline">
                  Open deck
                </Link>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
