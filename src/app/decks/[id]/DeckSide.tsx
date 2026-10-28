"use client";

import { ImageExport } from "./ImageExport";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Copy, Download, Link2, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/fields";
import { cn } from "@/lib/ui";
import type { UnrecognizedLine } from "@/lib/decks/resolve";
import { deleteDeck, deleteMatch, logMatch, resolveImportLine, restoreVersion, setSharing } from "../actions";

// ───────────────────────────── import lines to fix ─────────────────────────────

export function PendingImport({ deckId, lines }: { deckId: string; lines: UnrecognizedLine[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [searching, setSearching] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; type: string }[]>([]);
  if (!lines.length) return null;

  const act = (lineNo: number, cardId: string | null) =>
    start(async () => {
      const r = await resolveImportLine({ deckId, lineNo, cardId });
      if (!r.ok) setErr(r.message);
      else {
        setSearching(null);
        setQ("");
        setHits([]);
        router.refresh();
      }
    });

  const search = async (text: string) => {
    setQ(text);
    if (text.trim().length < 2) return setHits([]);
    const r = await fetch(`/api/search?q=${encodeURIComponent(text)}`).then((r) => r.json());
    setHits(r.cards ?? []);
  };

  return (
    <section role="region" aria-labelledby="pending-h" className="mb-6 rounded-[var(--radius-panel)] border border-caution/30 bg-caution-tint p-4" data-testid="pending-import">
      <h2 id="pending-h" className="text-sm font-semibold text-caution">
        {lines.length} {lines.length === 1 ? "line" : "lines"} from your import didn&apos;t match a card
      </h2>
      <p className="mt-0.5 text-xs text-caution">Pick the right card or dismiss the line. Save any edits below first — fixing a line reloads the list.</p>
      {err && <p className="mt-2 text-sm text-loss">{err}</p>}
      <ul className="mt-3 space-y-2">
        {lines.map((l) => (
          <li key={l.lineNo} className="rounded-[var(--radius-control)] border border-rule bg-sheet p-3" data-testid="pending-line">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm">
                <span className="num text-xs text-ink-3">line {l.lineNo}</span> <span className="font-medium">{l.raw}</span>
              </p>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => setSearching(searching === l.lineNo ? null : l.lineNo)}>
                  <Search size={13} aria-hidden /> Find card
                </Button>
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(l.lineNo, null)}>
                  Dismiss
                </Button>
              </div>
            </div>
            {l.suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-ink-3">Did you mean</span>
                {l.suggestions.map((s) => (
                  <button
                    key={s.cardId}
                    type="button"
                    disabled={pending}
                    onClick={() => act(l.lineNo, s.cardId)}
                    className="rounded-full border border-rule bg-sheet px-2.5 py-1 hover:border-quill hover:text-quill"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
            {searching === l.lineNo && (
              <div className="mt-2">
                <label className="sr-only" htmlFor={`fix-${l.lineNo}`}>
                  Search for the right card
                </label>
                <input
                  id={`fix-${l.lineNo}`}
                  autoFocus
                  value={q}
                  onChange={(e) => search(e.target.value)}
                  placeholder="Type the card name"
                  className="h-9 w-full rounded-[var(--radius-control)] border border-rule bg-inset px-3 text-sm focus:border-quill focus:bg-sheet focus:outline-none"
                />
                {hits.length > 0 && (
                  <ul className="mt-1 max-h-48 overflow-y-auto rounded-[var(--radius-control)] border border-rule">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button type="button" onClick={() => act(l.lineNo, h.id)} className="flex w-full justify-between px-3 py-1.5 text-left text-sm hover:bg-hover">
                          <span>{h.name}</span>
                          <span className="text-xs text-ink-3">{h.type}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ───────────────────────────── versions ─────────────────────────────

export function RestoreButton({ deckId, version }: { deckId: string; version: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await restoreVersion({ deckId, version });
          router.refresh();
        })
      }
    >
      {pending ? "Restoring…" : "Restore"}
    </Button>
  );
}

// ───────────────────────────── match log ─────────────────────────────

const EVENTS = [
  ["CASUAL", "Casual"],
  ["LOCAL", "Local event"],
  ["STORE", "Store championship"],
  ["REGIONAL", "Regional"],
  ["ONLINE", "Online"],
  ["OTHER", "Other"],
] as const;

export function MatchForm({ deckId, today, legends }: { deckId: string; today: string; legends: string[] }) {
  const router = useRouter();
  const [opp, setOpp] = useState("");
  const [result, setResult] = useState<"WIN" | "LOSS" | "DRAW">("WIN");
  const [eventType, setEventType] = useState("CASUAL");
  const [playedOn, setPlayedOn] = useState(today);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        const submitted = opp;
        start(async () => {
          const r = await logMatch({ deckId, opponentLegend: submitted, result, eventType: eventType as "CASUAL", playedOn });
          setErrors(r.ok ? {} : (r.fieldErrors ?? {}));
          setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "") : r.message });
          if (r.ok) {
            // only clear the field if it still holds what was just logged
            setOpp((cur) => (cur === submitted ? "" : cur));
            router.refresh();
          }
        });
      }}
      className="space-y-3"
      aria-label="Log a match"
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
        <div>
          <TextField label="Opponent's Legend" list="legend-names" value={opp} onChange={(e) => setOpp(e.target.value)} error={errors.opponentLegend} placeholder="e.g. Jinx - Loose Cannon" />
          <datalist id="legend-names">
            {legends.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>
        <TextField label="Played on" type="date" value={playedOn} max={today} onChange={(e) => setPlayedOn(e.target.value)} error={errors.playedOn} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Result</legend>
          <div className="inline-flex rounded-[var(--radius-control)] border border-rule bg-inset p-0.5">
            {(["WIN", "LOSS", "DRAW"] as const).map((r) => (
              <label key={r} className="cursor-pointer">
                <input type="radio" name="result" value={r} checked={result === r} onChange={() => setResult(r)} className="peer sr-only" />
                <span className="inline-flex h-8 items-center rounded-[3px] px-3 text-[13px] text-ink-2 peer-checked:bg-sheet peer-checked:font-medium peer-checked:text-ink peer-checked:shadow-[0_0_0_1px_var(--rule)] peer-focus-visible:outline-2 peer-focus-visible:outline-quill">
                  {r === "WIN" ? "Win" : r === "LOSS" ? "Loss" : "Draw"}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <SelectField label="Event" value={eventType} onChange={(e) => setEventType(e.target.value)} options={EVENTS.map(([value, label]) => ({ value, label }))} className="w-44" />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Log match"}
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

export function DeleteMatchButton({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await deleteMatch(matchId);
          router.refresh();
        })
      }
      className="text-xs text-ink-3 hover:text-loss"
      aria-label="Delete match"
    >
      Delete
    </button>
  );
}

// ───────────────────────────── export & share ─────────────────────────────

export function ExportShare({ deckId, deckName, shareToken }: { deckId: string; deckName: string; shareToken: string | null }) {
  const router = useRouter();
  const [token, setToken] = useState(shareToken);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const shareUrl = token && typeof window !== "undefined" ? `${window.location.origin}/share/deck/${token}` : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm">
          <a href={`/decks/${deckId}/export?format=txt`} download>
            <Download size={14} aria-hidden /> Text
          </a>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <a href={`/decks/${deckId}/export?format=csv`} download>
            <Download size={14} aria-hidden /> CSV
          </a>
        </Button>
        <ImageExport deckId={deckId} deckName={deckName} />
      </div>
      <div>
        {token ? (
          <div className="space-y-2">
            <p className="text-sm text-ink-2">Anyone with the link can view this deck (read-only, no prices or collection).</p>
            <div className="flex gap-2">
              <input readOnly value={shareUrl ?? ""} aria-label="Share link" className="h-9 min-w-0 flex-1 rounded-[var(--radius-control)] border border-rule bg-inset px-3 text-xs" />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (shareUrl) navigator.clipboard?.writeText(shareUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                <Copy size={14} aria-hidden /> {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await setSharing({ deckId, on: false });
                  if (r.ok) setToken(null);
                })
              }
            >
              Stop sharing
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await setSharing({ deckId, on: true });
                if (r.ok) setToken(r.data.token);
              })
            }
          >
            <Link2 size={14} aria-hidden /> Create share link
          </Button>
        )}
      </div>
      <div className="border-t border-rule pt-3">
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-2">Delete this deck, its versions and match log?</span>
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await deleteDeck(deckId);
                  if (r.ok) router.push("/decks");
                })
              }
            >
              Delete deck
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
            Delete deck…
          </Button>
        )}
      </div>
    </div>
  );
}
