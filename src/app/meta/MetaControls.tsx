"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/fields";
import { cn } from "@/lib/ui";
import { copyMetaToDecks, deleteMeta, importMeta, resolveMetaLine } from "./actions";
import type { UnrecognizedLine } from "@/lib/decks/resolve";

export function CopyToDecks({ metaId }: { metaId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await copyMetaToDecks(metaId);
          if (r.ok) router.push(`/decks/${r.data.deckId}`);
        })
      }
    >
      {pending ? "Copying…" : "Copy to my decks"}
    </Button>
  );
}

export function DeleteMeta({ metaId }: { metaId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  if (!confirm)
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
        Delete
      </Button>
    );
  return (
    <span className="flex items-center gap-2">
      <Button
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await deleteMeta(metaId);
            router.push("/meta");
          })
        }
      >
        Delete list
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
        Keep
      </Button>
    </span>
  );
}

export function MetaPending({ metaId, lines }: { metaId: string; lines: UnrecognizedLine[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!lines.length) return null;
  const act = (lineNo: number, cardId: string | null) =>
    start(async () => {
      await resolveMetaLine({ metaId, lineNo, cardId });
      router.refresh();
    });
  return (
    <section className="mb-6 rounded-[var(--radius-panel)] border border-caution/30 bg-caution-tint p-4" data-testid="meta-pending">
      <h2 className="text-sm font-semibold text-caution">
        {lines.length} {lines.length === 1 ? "line" : "lines"} didn&apos;t match a card
      </h2>
      <ul className="mt-2 space-y-2">
        {lines.map((l) => (
          <li key={l.lineNo} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border border-rule bg-sheet px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 font-medium">{l.raw}</span>
            {l.suggestions.map((s) => (
              <button key={s.cardId} type="button" disabled={pending} onClick={() => act(l.lineNo, s.cardId)} className="rounded-full border border-rule px-2.5 py-0.5 text-xs hover:border-quill hover:text-quill">
                {s.name}
              </button>
            ))}
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(l.lineNo, null)}>
              Dismiss
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MetaImportForm({ today }: { today: string }) {
  const router = useRouter();
  const [f, setF] = useState({ event: "", placement: "", playedOn: today, archetype: "", sourceUrl: "", text: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      noValidate
      className="space-y-4 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await importMeta(f);
          if (r.ok) router.push(`/meta/${r.data.metaId}`);
          else {
            setErrors(r.fieldErrors ?? {});
            setMsg(r.message);
          }
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Archetype" value={f.archetype} onChange={set("archetype")} error={errors.archetype} placeholder="e.g. Jinx aggro" />
        <TextField label="Event" value={f.event} onChange={set("event")} error={errors.event} placeholder="e.g. Regional Championship Bangkok" />
        <TextField label="Placement" optional value={f.placement} onChange={set("placement")} error={errors.placement} placeholder="1st, Top 8…" />
        <TextField label="Date" type="date" value={f.playedOn} max={today} onChange={set("playedOn")} error={errors.playedOn} />
      </div>
      <TextField label="Source link" optional type="url" value={f.sourceUrl} onChange={set("sourceUrl")} error={errors.sourceUrl} placeholder="https://…" />
      <div>
        <label htmlFor="meta-text" className="mb-1.5 block text-sm font-medium">
          Decklist
        </label>
        <textarea
          id="meta-text"
          rows={14}
          value={f.text}
          onChange={set("text")}
          aria-invalid={!!errors.text}
          placeholder={"Legend:\n1 …\nMain Deck:\n3 …"}
          className={cn("num w-full rounded-[var(--radius-control)] border bg-inset px-3 py-2 text-[13px] leading-relaxed focus:border-quill focus:bg-sheet focus:outline-none", errors.text ? "border-loss" : "border-rule")}
        />
        {errors.text ? <p className="mt-1 text-sm text-loss">{errors.text}</p> : <p className="mt-1 text-xs text-ink-3">Same format as deck import. Lines that don&apos;t match a card are listed for you to fix.</p>}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Importing…" : "Import list"}
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
