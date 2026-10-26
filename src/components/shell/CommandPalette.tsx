"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, BookOpen, Library, Search } from "lucide-react";
import { cn } from "@/lib/ui";
import { DomainStripe } from "@/components/cards/DomainStripe";

interface Results {
  cards: { id: string; name: string; type: string; setCode: string; imageUrl: string | null; domains: string }[];
  sets: { code: string; name: string }[];
  locations: { id: string; name: string }[];
}

interface Row {
  key: string;
  href: string;
  group: string;
  label: string;
  meta: string;
  thumb?: { url: string | null; domains: string };
  icon?: typeof BookOpen;
}

const EMPTY: Results = { cards: [], sets: [], locations: [] };

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results>(EMPTY);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) {
      setQ("");
      setResults(EMPTY);
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(EMPTY);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((r: Results) => {
          setResults(r);
          setActive(0);
        })
        .catch(() => {});
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const rows: Row[] = useMemo(
    () => [
      ...results.cards.map((c) => ({
        key: `c-${c.id}`,
        href: `/cards/${c.id}`,
        group: "Cards",
        label: c.name,
        meta: `${c.type} · ${c.setCode}`,
        thumb: { url: c.imageUrl, domains: c.domains },
      })),
      ...results.sets.map((s) => ({
        key: `s-${s.code}`,
        href: `/cards?set=${s.code}`,
        group: "Sets",
        label: s.name,
        meta: s.code,
        icon: Library,
      })),
      ...results.locations.map((l) => ({
        key: `l-${l.id}`,
        href: `/settings#location-${l.id}`,
        group: "Storage",
        label: l.name,
        meta: "Location",
        icon: Archive,
      })),
    ],
    [results],
  );

  const go = useCallback(
    (row: Row | undefined) => {
      if (!row) return;
      onOpenChange(false);
      router.push(row.href);
    },
    [onOpenChange, router],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 px-4 pt-[12vh]" onMouseDown={() => onOpenChange(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="w-full max-w-[560px] overflow-hidden rounded-[var(--radius-panel)] border border-rule-strong bg-sheet shadow-[0_12px_40px_-12px_rgba(22,24,29,0.25)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-rule px-4">
          <Search size={16} className="text-ink-3" aria-hidden />
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onOpenChange(false);
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, rows.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") go(rows[active]);
            }}
            placeholder="Cards, sets, storage locations…"
            aria-label="Search cards, sets and locations"
            aria-activedescendant={rows[active] ? `row-${rows[active].key}` : undefined}
            className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-4"
            style={{ outline: "none" }}
          />
          <kbd className="num text-[11px] text-ink-3">esc</kbd>
        </div>
        <ul role="listbox" className="max-h-[52vh] overflow-y-auto py-1">
          {q.trim().length >= 2 && rows.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-ink-3">No matches for “{q}”.</li>
          )}
          {q.trim().length < 2 && (
            <li className="px-4 py-6 text-center text-sm text-ink-3">Type a card name — typos are fine.</li>
          )}
          {rows.map((row, i) => {
            const showGroup = i === 0 || rows[i - 1].group !== row.group;
            const Icon = row.icon;
            return (
              <li key={row.key}>
                {showGroup && <div className="eyebrow px-4 pt-3 pb-1">{row.group}</div>}
                <button
                  id={`row-${row.key}`}
                  role="option"
                  aria-selected={i === active}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(row)}
                  className={cn("flex w-full items-center gap-3 px-4 py-2 text-left", i === active && "bg-hover")}
                >
                  {row.thumb ? (
                    <span className="relative h-10 w-[29px] shrink-0 overflow-hidden rounded-[3px] bg-inset">
                      {row.thumb.url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.thumb.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                      )}
                      <DomainStripe domains={row.thumb.domains} className="absolute inset-x-0 top-0 h-[2px]" />
                    </span>
                  ) : (
                    Icon && (
                      <span className="grid h-10 w-[29px] place-items-center text-ink-3">
                        <Icon size={16} aria-hidden />
                      </span>
                    )
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm">{row.label}</span>
                  <span className="num shrink-0 text-xs text-ink-3">{row.meta}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
