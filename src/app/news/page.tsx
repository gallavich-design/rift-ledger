import Link from "next/link";
import { Bell, CircleAlert, Ban, RefreshCw, TrendingDown, TrendingUp, FileText } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { dayKey } from "@/config/app";
import { RULING_LABEL, type RulingType } from "@/lib/rulings/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui";
import { AlertRow, MarkAllRead } from "./AlertControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "News & Alerts" };

const ICON: Record<string, typeof Bell> = {
  RULING_BAN: Ban,
  RULING_UNBAN: RefreshCw,
  RULING_ERRATA: FileText,
  RULING_ROTATION: RefreshCw,
  PRICE_TARGET: TrendingDown,
  DECK_NEED: TrendingDown,
  PRICE_MOVE: TrendingUp,
};

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "alerts" } = await searchParams;
  const userId = await getCurrentUserId();
  const [alerts, unread, rulings] = await Promise.all([
    db.alert.findMany({ where: { userId }, orderBy: [{ read: "asc" }, { createdAt: "desc" }], take: 100 }),
    db.alert.count({ where: { userId, read: false } }),
    db.rulingEvent.findMany({ orderBy: [{ effectiveOn: "desc" }, { createdAt: "desc" }], include: { cards: { include: { card: { select: { id: true, name: true } } } } }, take: 100 }),
  ]);

  return (
    <div className="mx-auto max-w-[880px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="News & Alerts"
        actions={
          <Button asChild variant="secondary">
            <Link href="/news/new">Add ruling</Link>
          </Button>
        }
      />
      <nav aria-label="News" className="mb-5 flex gap-1 border-b border-rule">
        {[
          ["alerts", `Alerts${unread ? ` · ${unread}` : ""}`],
          ["rulings", "Errata, bans & rotation"],
        ].map(([k, label]) => (
          <Link
            key={k}
            href={`/news?tab=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 pb-2 text-sm", tab === k ? "border-quill font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink")}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "alerts" ? (
        <>
          {unread > 0 && (
            <div className="mb-3 flex justify-end">
              <MarkAllRead />
            </div>
          )}
          {alerts.length === 0 ? (
            <div className="rounded-[var(--radius-panel)] border border-dashed border-rule-strong px-6 py-12 text-center">
              <Bell className="mx-auto text-ink-4" aria-hidden />
              <p className="mt-2 font-medium">No alerts yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-3">
                You&apos;ll hear here when a card you own or play is errata&apos;d, banned or rotating, and when a{" "}
                <Link href="/watchlist" className="text-quill hover:underline">
                  watched
                </Link>{" "}
                price hits your target.
              </p>
            </div>
          ) : (
            <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-sheet" data-testid="alerts">
              {alerts.map((a) => {
                const p = JSON.parse(a.payload) as { title: string; body: string; href?: string };
                const Icon = ICON[a.type] ?? CircleAlert;
                return <AlertRow key={a.id} id={a.id} read={a.read} title={p.title} body={p.body} href={p.href} type={a.type} when={a.createdAt.toISOString()} icon={<Icon size={16} aria-hidden />} />;
              })}
            </ul>
          )}
        </>
      ) : rulings.length === 0 ? (
        <div className="rounded-[var(--radius-panel)] border border-dashed border-rule-strong px-6 py-12 text-center">
          <p className="font-medium">No rulings entered</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-3">When Riot announces errata, a ban or a rotation, add it here — anyone who owns or plays the cards gets an alert.</p>
          <Button asChild className="mt-4">
            <Link href="/news/new">Add ruling</Link>
          </Button>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-sheet" data-testid="rulings">
          {rulings.map((r) => (
            <li key={r.id} className="border-b border-rule-soft last:border-b-0">
              <Link href={`/news/${r.id}`} className="flex items-start gap-4 px-4 py-3 hover:bg-hover">
                <span className="num w-24 shrink-0 pt-0.5 text-xs text-ink-3">{dayKey(r.effectiveOn)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={cn("rounded-[3px] px-1.5 py-0.5 text-[11px] font-medium", r.type === "BAN" ? "bg-loss-tint text-loss" : r.type === "ERRATA" ? "bg-caution-tint text-caution" : "bg-inset text-ink-2")}>{RULING_LABEL[r.type as RulingType]}</span>
                    <span className="truncate text-sm font-medium">{r.title}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink-3">{r.setCode ? `Set ${r.setCode}` : r.cards.map((c) => c.card.name).join(", ")}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
