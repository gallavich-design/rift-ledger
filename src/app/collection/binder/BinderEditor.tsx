"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Search } from "lucide-react";
import { FramedImage } from "@/components/cards/FramedImage";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/fields";
import { BinderPicker, type BinderValue, type LocationOption } from "@/components/collection/BinderPicker";
import { AddedResult } from "@/components/collection/AddedResult";
import { cn } from "@/lib/ui";
import { saveBinderCounts } from "../actions";

export interface EditorSlot {
  key: string;
  number: number;
  name: string;
  label: string; // rarity, or the art for special printings
  imageUrl: string | null;
  owned: number;
}

/**
 * "Edit what I own": tell the app which cards of this set you have — tap a card to count one more,
 * − / + to adjust — and save once. New copies go into the binder you pick, as cards you already own.
 */
export function BinderEditor({
  setCode,
  setName,
  scope,
  slots,
  locations,
  defaultBinder,
  today,
  doneHref,
}: {
  setCode: string;
  setName: string;
  scope: "base" | "all";
  slots: EditorSlot[];
  locations: LocationOption[];
  defaultBinder: BinderValue;
  today: string;
  doneHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [binder, setBinder] = useState<BinderValue>(defaultBinder);
  const [cost, setCost] = useState<"market" | "zero">("market");
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"all" | "missing" | "owned">("all");
  const [result, setResult] = useState<{ ok: boolean; text: string; lotIds?: string[] } | null>(null);

  const countOf = (s: EditorSlot) => counts[s.key] ?? s.owned;
  const changed = slots.filter((s) => countOf(s) !== s.owned);
  const added = changed.reduce((a, s) => a + Math.max(0, countOf(s) - s.owned), 0);
  const removed = changed.reduce((a, s) => a + Math.max(0, s.owned - countOf(s)), 0);
  const set = (s: EditorSlot, n: number) => setCounts((c) => ({ ...c, [s.key]: Math.max(0, Math.min(999, n)) }));

  useEffect(() => {
    if (!changed.length) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [changed.length]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return slots.filter((s) => {
      const n = counts[s.key] ?? s.owned;
      if (show === "missing" && n > 0) return false;
      if (show === "owned" && n === 0) return false;
      return !needle || s.name.toLowerCase().includes(needle) || String(s.number).padStart(3, "0").includes(needle);
    });
  }, [slots, counts, q, show]);

  return (
    <div className="mt-4" data-testid="binder-editor">
      <section className="rounded-[var(--radius-panel)] border border-quill/30 bg-quill-tint/40 p-4" aria-label="Edit what I own">
        <h2 className="text-base font-semibold">Edit what I own · {setName}</h2>
        <p className="mt-1 text-sm text-ink-2">Tap a card to count one more, or use − / +. Nothing changes until you save. Lowering a count removes copies.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <BinderPicker label="New copies go in" locations={locations} value={binder} onChange={setBinder} />
          <Segmented
            label="Track value from"
            name={`be-cost-${setCode}`}
            value={cost}
            onChange={setCost}
            options={[
              { value: "market", label: "Today's price" },
              { value: "zero", label: "No cost" },
            ]}
          />
        </div>
      </section>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full border border-rule bg-sheet px-3 text-[13px] focus-within:border-quill sm:max-w-72">
          <Search size={14} className="shrink-0 text-ink-3" aria-hidden />
          <span className="sr-only">Find a card</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find by name or number" className="min-w-0 flex-1 bg-transparent focus:outline-none" />
        </label>
        <div role="group" aria-label="Show" className="inline-flex rounded-[var(--radius-control)] border border-rule bg-inset p-0.5 text-[13px]">
          {(["all", "missing", "owned"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={show === k}
              onClick={() => setShow(k)}
              className={cn("inline-flex h-7 items-center rounded-[3px] px-2.5 capitalize", show === k ? "bg-sheet font-medium text-ink shadow-[0_0_0_1px_var(--rule)]" : "text-ink-3 hover:text-ink")}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7" data-testid="binder-edit-grid">
        {shown.map((s) => {
          const n = countOf(s);
          const diff = n - s.owned;
          return (
            <li key={s.key} className="min-w-0" data-testid="edit-slot" data-count={n}>
              <button
                type="button"
                onClick={() => set(s, n + 1)}
                aria-label={`${s.name} ${String(s.number).padStart(3, "0")}: ${n} owned — add one`}
                className={cn(
                  "relative block aspect-[744/1039] w-full overflow-hidden rounded-[var(--radius-art)] bg-inset transition active:scale-[0.98]",
                  diff ? "ring-2 ring-quill" : n ? "ring-1 ring-rule" : "border border-dashed border-rule-strong",
                )}
              >
                {s.imageUrl && <FramedImage src={s.imageUrl} alt="" missingLabel={s.name} className={cn(!n && "opacity-25 grayscale")} />}
                <span className="num absolute top-1.5 left-1.5 rounded-[3px] bg-sheet/95 px-1 text-[10px] text-ink-2">{String(s.number).padStart(3, "0")}</span>
                {diff !== 0 && (
                  <span className={cn("num absolute top-1.5 right-1.5 rounded-[3px] px-1 text-[10px] font-semibold text-white", diff > 0 ? "bg-quill" : "bg-loss")}>
                    {diff > 0 ? `+${diff}` : diff}
                  </span>
                )}
              </button>
              <span className={cn("mt-1 block truncate text-xs", n ? "font-medium text-ink" : "text-ink-3")}>{s.name}</span>
              <span className="mt-1 flex items-center justify-end gap-1 sm:justify-between">
                <span className="hidden truncate text-[11px] text-ink-3 sm:inline">{s.label}</span>
                <span className="inline-flex shrink-0 items-center rounded-[var(--radius-control)] border border-rule bg-sheet">
                  <button type="button" className="grid size-7 place-items-center text-ink-2 hover:bg-hover disabled:opacity-30" disabled={n === 0} onClick={() => set(s, n - 1)} aria-label={`One fewer ${s.name}`}>
                    <Minus size={12} />
                  </button>
                  <span className="num w-6 text-center text-xs font-semibold" aria-live="polite">
                    {n}
                  </span>
                  <button type="button" className="grid size-7 place-items-center text-ink-2 hover:bg-hover" onClick={() => set(s, n + 1)} aria-label={`One more ${s.name}`}>
                    <Plus size={12} />
                  </button>
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && <p className="mt-6 text-center text-sm text-ink-3">No cards match.</p>}

      {/* Save bar */}
      <div className="sticky bottom-16 z-20 mt-6 md:bottom-4">
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-panel)] border border-rule-strong bg-sheet px-4 py-3 shadow-[0_12px_32px_-12px_rgba(22,24,29,0.35)]">
          {result && !changed.length ? (
            result.ok ? (
              <AddedResult text={result.text} lotIds={result.lotIds ?? []} testid="binder-edit-result" />
            ) : null
          ) : (
            <p className="text-sm text-ink-2" data-testid="binder-edit-summary">
              {changed.length ? (
                <>
                  <span className="num font-medium text-ink">{changed.length}</span> {changed.length === 1 ? "card" : "cards"} changed
                  {added > 0 && <span className="num text-quill"> · +{added}</span>}
                  {removed > 0 && <span className="num text-loss"> · −{removed}</span>}
                </>
              ) : (
                "Tap the cards you own."
              )}
            </p>
          )}
          {result && !result.ok && (
            <p role="alert" className="basis-full text-sm text-loss">
              {result.text}
            </p>
          )}
          <span className="ml-auto flex gap-2">
            {changed.length > 0 && (
              <Button variant="ghost" onClick={() => setCounts({})} disabled={pending}>
                Discard
              </Button>
            )}
            {changed.length > 0 ? (
              <Button
                disabled={pending || ("newName" in binder && !binder.newName.trim())}
                onClick={() =>
                  start(async () => {
                    const r = await saveBinderCounts({ setCode, scope, cost, binder, acquiredOn: today, counts: changed.map((s) => ({ key: s.key, count: countOf(s) })) });
                    if (r.ok) {
                      // Undo only when the save just added cards (it can't bring back removed ones).
                      setResult({ ok: true, text: r.message ?? "Saved.", lotIds: r.data.removed ? [] : r.data.lotIds });
                      setCounts({});
                      router.refresh();
                    } else setResult({ ok: false, text: r.message });
                  })
                }
                data-testid="binder-edit-save"
              >
                {pending ? "Saving…" : "Save"}
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <Link href={doneHref}>Done</Link>
              </Button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
