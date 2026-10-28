"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, Search } from "lucide-react";
import { Suspense, useState } from "react";
import { cn } from "@/lib/ui";
import { CURRENT_PHASE, NAV } from "./nav";
import { CommandPalette } from "./CommandPalette";
import { DemoBanner } from "./DemoBanner";
import { NavProgress } from "./NavProgress";

export function AppShell({ children, demo = false, unread = 0 }: { children: React.ReactNode; demo?: boolean; unread?: number }) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const ready = NAV.filter((n) => n.readyIn <= CURRENT_PHASE);
  const PRIMARY = ["/dashboard", "/collection", "/decks", "/news"];
  const primary = PRIMARY.map((h) => ready.find((n) => n.href === h)).filter((n): n is (typeof NAV)[number] => !!n);
  const secondary = ready.filter((n) => !PRIMARY.includes(n.href));
  const [moreOpen, setMoreOpen] = useState(false);

  // Sign-in and public share pages stand alone: no navigation into the private app.
  if (pathname === "/login" || pathname.startsWith("/share/")) return <main className="min-h-dvh">{children}</main>;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <Suspense fallback={null}>
        <NavProgress />
      </Suspense>
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
                    <span className="flex-1">{item.label}</span>
                    {item.href === "/news" && unread > 0 && (
                      <span className="num rounded-full bg-quill px-1.5 py-px text-[11px] font-medium text-quill-ink" data-testid="unread-badge">
                        {unread}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}
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

      <main className="min-w-0 pb-24 md:pb-10">
        {demo && <DemoBanner />}
        {children}
      </main>

      {/* Mobile bottom tab bar: four primary screens + More (spec §6) */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-sheet pb-[env(safe-area-inset-bottom)] md:hidden">
        {moreOpen && (
          <div className="border-b border-rule bg-sheet px-2 py-2" id="more-menu">
            <ul className="grid grid-cols-2 gap-1">
              {secondary.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      aria-current={isActive(item.href) ? "page" : undefined}
                      className={cn("flex h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm", isActive(item.href) ? "bg-quill-tint text-quill" : "text-ink-2 hover:bg-hover")}
                    >
                      <Icon size={17} aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <ul className="grid grid-cols-5">
          {primary.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn("relative flex h-14 flex-col items-center justify-center gap-1 text-[11px]", active ? "text-quill" : "text-ink-3")}
                >
                  <Icon size={19} aria-hidden />
                  {item.label === "News & Alerts" ? "Alerts" : item.label}
                  {item.href === "/news" && unread > 0 && (
                    <span className="num absolute top-1.5 left-1/2 ml-1.5 rounded-full bg-quill px-1 text-[10px] font-medium text-quill-ink">
                      {unread}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-controls="more-menu"
              onClick={() => setMoreOpen((o) => !o)}
              className={cn("flex h-14 w-full flex-col items-center justify-center gap-1 text-[11px]", moreOpen || secondary.some((i) => isActive(i.href)) ? "text-quill" : "text-ink-3")}
            >
              <MoreHorizontal size={19} aria-hidden />
              More
            </button>
          </li>
        </ul>
      </nav>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

export function LedgerMark() {
  // Two offset card outlines — a ledger of cards.
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <rect x="6.5" y="2.5" width="12" height="16" rx="2" fill="none" stroke="var(--ink-3)" />
      <rect x="3.5" y="4.5" width="12" height="16" rx="2" fill="var(--sheet)" stroke="var(--ink)" />
      <path d="M6.5 15.5l2.5-3 2 2 2.5-4" fill="none" stroke="var(--quill)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
