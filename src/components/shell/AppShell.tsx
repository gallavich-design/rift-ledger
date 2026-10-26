"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/ui";
import { CURRENT_PHASE, NAV } from "./nav";
import { CommandPalette } from "./CommandPalette";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const ready = NAV.filter((n) => n.readyIn <= CURRENT_PHASE);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      {/* Desktop rail — same canvas as content, separated by a rule */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-rule md:flex">
        <div className="flex h-14 items-center gap-2 px-5">
          <LedgerMark />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">Rift Ledger</span>
        </div>
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 w-full items-center gap-2 rounded-[var(--radius-control)] border border-rule bg-inset px-3 text-left text-sm text-ink-3 hover:border-rule-strong"
          >
            <Search size={15} aria-hidden />
            <span className="flex-1">Search</span>
            <kbd className="num text-[11px] text-ink-3">⌘K</kbd>
          </button>
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-6">
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const Icon = item.icon;
              const built = item.readyIn <= CURRENT_PHASE;
              if (!built) {
                return (
                  <li
                    key={item.href}
                    className="flex h-9 items-center gap-3 px-3 text-sm text-ink-4"
                    title={`Arrives in phase ${item.readyIn}`}
                  >
                    <Icon size={16} aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    <span className="num text-[10px] tracking-wide" aria-hidden>
                      P{item.readyIn}
                    </span>
                    <span className="sr-only">(not available yet, arrives in phase {item.readyIn})</span>
                  </li>
                );
              }
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm",
                      active ? "bg-sheet font-medium text-ink ring-1 ring-rule" : "text-ink-2 hover:bg-hover hover:text-ink",
                    )}
                  >
                    <Icon size={16} aria-hidden className={active ? "text-quill" : undefined} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-rule bg-paper/95 px-4 backdrop-blur md:hidden">
        <LedgerMark />
        <span className="flex-1 text-[15px] font-semibold">Rift Ledger</span>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="grid size-9 place-items-center rounded-[var(--radius-control)] text-ink-2 hover:bg-hover"
          aria-label="Search"
        >
          <Search size={18} />
        </button>
      </header>

      <main className="min-w-0 pb-24 md:pb-10">{children}</main>

      {/* Mobile bottom tab bar — only built screens */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-sheet pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${ready.length}, minmax(0, 1fr))` }}>
          {ready.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex h-14 flex-col items-center justify-center gap-1 text-[11px]", active ? "text-quill" : "text-ink-3")}
                >
                  <Icon size={19} aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

function LedgerMark() {
  // Two offset card outlines — a ledger of cards.
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <rect x="6.5" y="2.5" width="12" height="16" rx="2" fill="none" stroke="var(--ink-3)" />
      <rect x="3.5" y="4.5" width="12" height="16" rx="2" fill="var(--sheet)" stroke="var(--ink)" />
      <path d="M6.5 15.5l2.5-3 2 2 2.5-4" fill="none" stroke="var(--quill)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
