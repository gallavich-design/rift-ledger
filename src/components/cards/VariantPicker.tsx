"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/ui";
import { formatMoney } from "@/lib/money/money";
import { DomainStripe } from "./DomainStripe";

export interface PickedVariant {
  id: string;
  cardId: string;
  name: string;
  domains: string;
  setCode: string;
  setName: string;
  collectorNumber: number | null;
  art: string;
  finish: string;
  language: string;
  graded: string | null;
  rarity: string | null;
  imageUrl: string | null;
  tcgMarket: number | null;
  tcgDay: string | null;
}

interface CardHit {
  id: string;
  name: string;
  type: string;
  setCode: string;
  imageUrl: string | null;
  domains: string;
}

export function variantLabel(v: Pick<PickedVariant, "art" | "finish" | "setCode" | "collectorNumber" | "graded" | "language">) {
  return [
    `${v.setCode}·${String(v.collectorNumber ?? "").padStart(3, "0")}`,
    v.art,
    v.finish === "FOIL" ? "Foil" : "Normal",
    v.language !== "EN" ? v.language : null,
    v.graded,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Two-step, keyboard-friendly picker: type a card name (typos fine) → Enter picks the top card →
 * choose the printing (arrow keys / Enter). Shows the latest TCGplayer price to help pick.
 */
export function VariantPicker({
  value,
  onChange,
  label = "Card",
  error,
  autoFocus,
  resetOnPick,
}: {
  value: PickedVariant | null;
  onChange: (v: PickedVariant | null) => void;
  label?: string;
  error?: string;
  autoFocus?: boolean;
  /** Stay in search mode after a pick (for adding many cards in a row, e.g. pack pulls). */
  resetOnPick?: boolean;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CardHit[]>([]);
  const [activeHit, setActiveHit] = useState(0);
  const [card, setCard] = useState<CardHit | null>(null);
  const [variants, setVariants] = useState<PickedVariant[]>([]);
  const [activeVar, setActiveVar] = useState(0);
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (card || q.trim().length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((r) => {
          setHits(r.cards ?? []);
          setActiveHit(0);
        })
        .catch(() => {});
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, card]);

  function pick(v: PickedVariant) {
    onChange(v);
    setCard(null);
    if (resetOnPick) {
      setQ("");
      setVariants([]);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  async function chooseCard(c: CardHit) {
    setCard(c);
    setHits([]);
    const r = await fetch(`/api/variants?card=${c.id}`).then((r) => r.json());
    const vs: PickedVariant[] = r.variants ?? [];
    setVariants(vs);
    setActiveVar(0);
    if (vs.length === 1) pick(vs[0]);
    else requestAnimationFrame(() => listRef.current?.focus());
  }

  function reset() {
    onChange(null);
    setCard(null);
    setVariants([]);
    setQ("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  if (value) {
    return (
      <div>
        <span className="mb-1.5 block text-sm font-medium">{label}</span>
        <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-rule bg-sheet px-2 py-1.5">
          <Thumb url={value.imageUrl} domains={value.domains} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{value.name}</p>
            <p className="num truncate text-xs text-ink-3">{variantLabel(value)}</p>
          </div>
          <button type="button" onClick={reset} className="grid size-8 place-items-center rounded-[var(--radius-control)] text-ink-3 hover:bg-hover" aria-label={`Change card (${value.name})`}>
            <X size={15} />
          </button>
        </div>
      </div>
    );
  }

  if (card) {
    return (
      <div>
        <span className="mb-1.5 block text-sm font-medium" id={`${uid}-print`}>
          Which printing of {card.name}?
        </span>
        <ul
          ref={listRef}
          tabIndex={0}
          role="listbox"
          aria-labelledby={`${uid}-print`}
          aria-activedescendant={variants[activeVar] ? `${uid}-pv-${variants[activeVar].id}` : undefined}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveVar((a) => Math.min(a + 1, variants.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveVar((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (variants[activeVar]) pick(variants[activeVar]);
            } else if (e.key === "Escape") reset();
          }}
          className="max-h-72 overflow-y-auto rounded-[var(--radius-control)] border border-rule bg-sheet focus:border-quill focus:outline-none"
        >
          {variants.length === 0 && <li className="px-3 py-3 text-sm text-ink-3">Loading printings…</li>}
          {variants.map((v, i) => (
            <li
              key={v.id}
              id={`${uid}-pv-${v.id}`}
              role="option"
              aria-selected={i === activeVar}
              onMouseEnter={() => setActiveVar(i)}
              onClick={() => pick(v)}
              className={cn("flex cursor-pointer items-center gap-3 px-2 py-1.5", i === activeVar && "bg-hover")}
            >
              <Thumb url={v.imageUrl} domains={v.domains} />
              <span className="num min-w-0 flex-1 truncate text-[13px]">{variantLabel(v)}</span>
              <span className="num shrink-0 text-xs text-ink-3">{v.tcgMarket != null ? formatMoney(v.tcgMarket, "USD") : "no price"}</span>
            </li>
          ))}
        </ul>
        <button type="button" onClick={reset} className="mt-1 text-xs text-quill hover:underline">
          Different card
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <label htmlFor={`${uid}-q`} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          id={`${uid}-q`}
          ref={inputRef}
          autoFocus={autoFocus}
          value={q}
          autoComplete="off"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveHit((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveHit((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && hits[activeHit]) {
              e.preventDefault();
              chooseCard(hits[activeHit]);
            }
          }}
          placeholder="Type a card name"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls={`${uid}-hits`}
          aria-invalid={!!error}
          className={cn(
            "h-10 w-full rounded-[var(--radius-control)] border bg-inset pr-3 pl-9 text-[15px] placeholder:text-ink-4 hover:border-rule-strong focus:border-quill focus:bg-sheet focus:outline-none",
            error ? "border-loss" : "border-rule",
          )}
        />
      </div>
      {error && <p className="mt-1 text-sm text-loss">{error}</p>}
      {hits.length > 0 && (
        <ul id={`${uid}-hits`} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-[var(--radius-control)] border border-rule-strong bg-sheet py-1 shadow-[0_12px_32px_-12px_rgba(22,24,29,0.25)]">
          {hits.map((h, i) => (
            <li
              key={h.id}
              role="option"
              aria-selected={i === activeHit}
              onMouseEnter={() => setActiveHit(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                chooseCard(h);
              }}
              className={cn("flex cursor-pointer items-center gap-3 px-2 py-1.5", i === activeHit && "bg-hover")}
            >
              <Thumb url={h.imageUrl} domains={h.domains} />
              <span className="min-w-0 flex-1 truncate text-sm">{h.name}</span>
              <span className="num shrink-0 text-xs text-ink-3">
                {h.type} · {h.setCode}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thumb({ url, domains }: { url: string | null; domains: string }) {
  return (
    <span className="relative h-9 w-[26px] shrink-0 overflow-hidden rounded-[3px] bg-inset">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />}
      <DomainStripe domains={domains} className="absolute inset-x-0 top-0 h-[2px]" />
    </span>
  );
}
