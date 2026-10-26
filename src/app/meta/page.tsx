import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { dayKey } from "@/config/app";
import { getFx, getSettings } from "@/lib/portfolio/data";
import { loadDeckCards, loadDeckPricing, loadOwned } from "@/lib/decks/data";
import { summarizeMeta, sortMeta, type MetaSort } from "@/lib/meta/summary";
import type { DeckLine, Section } from "@/lib/decks/types";
import { DOMAIN_ORDER, domainColor } from "@/config/domains";
import { formatMoney } from "@/lib/money/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { CardArt } from "@/components/cards/bits";
import { DomainStripe } from "@/components/cards/DomainStripe";
import { cn } from "@/lib/ui";
import { CopyToDecks } from "./MetaControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meta" };

type SP = { sort?: string; legend?: string; domain?: string; from?: string; to?: string };

export default async function MetaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const sort: MetaSort = sp.sort === "owned" || sp.sort === "newest" ? sp.sort : "cheapest";
  const userId = await getCurrentUserId();
  const settings = await getSettings(db, userId);
  const fx = await getFx(db, settings.fxOverrides);
  const display = settings.displayCurrency;
  const metas = await db.metaDeck.findMany({ where: { userId }, include: { cards: true }, orderBy: { createdAt: "desc" } });
  const cardIds = [...new Set(metas.flatMap((m) => m.cards.map((c) => c.cardId)))];
  const [cards, pricing, owned] = await Promise.all([
    loadDeckCards(db, cardIds),
    fx.table[display] ? loadDeckPricing(db, userId, cardIds, settings.defaultValuationSource, fx.table, display) : Promise.resolve(new Map()),
    loadOwned(db, userId, cardIds),
  ]);

  const rows = metas.map((m) => {
    const lines: DeckLine[] = m.cards.map((c) => ({ cardId: c.cardId, section: c.section as Section, quantity: c.quantity, proxyQuantity: 0 }));
    const legendLine = m.cards.find((c) => c.section === "LEGEND");
    const legend = legendLine ? cards.get(legendLine.cardId) : undefined;
    return {
      id: m.id,
      event: m.event,
      placement: m.placement,
      archetype: m.archetype,
      playedOn: m.playedOn ? dayKey(m.playedOn) : null,
      createdAt: m.createdAt.toISOString(),
      legend,
      pending: (JSON.parse(m.pendingImportLines) as unknown[]).length,
      summary: summarizeMeta(lines, owned, pricing),
    };
  });
  const legends = [...new Map(rows.filter((r) => r.legend).map((r) => [r.legend!.name, r.legend!])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const filtered = sortMeta(
    rows.filter(
      (r) =>
        (!sp.legend || r.legend?.name === sp.legend) &&
        (!sp.domain || r.legend?.domains.includes(sp.domain)) &&
        (!sp.from || (r.playedOn ?? "") >= sp.from) &&
        (!sp.to || (r.playedOn ?? "9999") <= sp.to),
    ),
    sort,
  );
  const href = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/meta?${s}` : "/meta";
  };

  return (
    <div className="mx-auto max-w-[1080px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="What can I build?"
        description="Tournament lists, measured against your collection."
        actions={
          <Button asChild>
            <Link href="/meta/import">Import a list</Link>
          </Button>
        }
      />
      {metas.length === 0 ? (
        <div className="rounded-[var(--radius-panel)] border border-dashed border-rule-strong px-6 py-12 text-center">
          <p className="font-medium">No meta decks yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-3">Paste a top-placing list from an event and see how much of it you already own and what it costs to finish.</p>
          <Button asChild className="mt-4">
            <Link href="/meta/import">Import a list</Link>
          </Button>
        </div>
      ) : (
        <>
          <form method="get" action="/meta" className="mb-4 flex flex-wrap items-end gap-3 rounded-[var(--radius-panel)] border border-rule bg-sheet p-3">
            <input type="hidden" name="sort" value={sort} />
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-2">Legend</span>
              <select name="legend" defaultValue={sp.legend ?? ""} className="h-9 rounded-[var(--radius-control)] border border-rule bg-inset px-2 text-sm">
                <option value="">Any</option>
                {legends.map((l) => (
                  <option key={l.name}>{l.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-2">Domain</span>
              <select name="domain" defaultValue={sp.domain ?? ""} className="h-9 rounded-[var(--radius-control)] border border-rule bg-inset px-2 text-sm">
                <option value="">Any</option>
                {DOMAIN_ORDER.filter((d) => d !== "Colorless").map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-2">From</span>
              <input type="date" name="from" defaultValue={sp.from} className="h-9 rounded-[var(--radius-control)] border border-rule bg-inset px-2 text-sm" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-2">To</span>
              <input type="date" name="to" defaultValue={sp.to} className="h-9 rounded-[var(--radius-control)] border border-rule bg-inset px-2 text-sm" />
            </label>
            <Button type="submit" variant="secondary" size="sm">
              Filter
            </Button>
            {(sp.legend || sp.domain || sp.from || sp.to) && (
              <Link href={href({ legend: undefined, domain: undefined, from: undefined, to: undefined })} className="text-sm text-quill hover:underline">
                Clear
              </Link>
            )}
          </form>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-3">
              <span className="num">{filtered.length}</span> of <span className="num">{rows.length}</span> lists
            </p>
            <div role="group" aria-label="Sort by" className="inline-flex rounded-[var(--radius-control)] border border-rule bg-inset p-0.5 text-[13px]">
              {(
                [
                  ["cheapest", "Cheapest"],
                  ["owned", "% owned"],
                  ["newest", "Newest"],
                ] as const
              ).map(([k, label]) => (
                <Link key={k} href={href({ sort: k })} aria-current={sort === k ? "true" : undefined} className={cn("inline-flex h-8 items-center rounded-[3px] px-3", sort === k ? "bg-sheet font-medium text-ink shadow-[0_0_0_1px_var(--rule)]" : "text-ink-3 hover:text-ink")}>
                  {label}
                  {k === "cheapest" && <span className="hidden sm:inline">&nbsp;to complete</span>}
                </Link>
              ))}
            </div>
          </div>

          <ul className="space-y-3" data-testid="meta-list">
            {filtered.map((r) => (
              <li key={r.id} className="rounded-[var(--radius-panel)] border border-rule bg-sheet" data-testid="meta-row">
                <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_auto] md:items-center">
                  <Link href={`/meta/${r.id}`} className="flex min-w-0 items-center gap-3 hover:text-quill">
                    <span className="relative w-12 shrink-0">
                      <CardArt src={r.legend?.imageUrl ?? null} alt="" className="rounded-[5px]" />
                      {r.legend && <DomainStripe domains={r.legend.domains} className="absolute inset-x-1 top-0 h-[3px]" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold" data-testid="meta-archetype">
                        {r.archetype}
                      </span>
                      <span className="block truncate text-xs text-ink-3">
                        {r.event}
                        {r.placement && <> · {r.placement}</>}
                        {r.playedOn && <> · {r.playedOn}</>}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {r.legend?.domains.map((d) => (
                          <span key={d} className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: domainColor(d).bg, color: domainColor(d).fg }}>
                            {d}
                          </span>
                        ))}
                      </span>
                    </span>
                  </Link>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-ink-3">You own</p>
                      <p className="num font-medium" data-testid="meta-owned">
                        {r.summary.pctOwned.toFixed(0)}%
                      </p>
                      <div className="mt-1 h-1.5 rounded-full bg-inset" aria-hidden>
                        <div className="h-1.5 rounded-full bg-quill" style={{ width: `${r.summary.pctOwned}%` }} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-ink-3">Missing</p>
                      <p className="num font-medium">{r.summary.missing}</p>
                      <p className="text-[11px] text-ink-3">of {r.summary.copies} cards</p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-3">To complete</p>
                      <p className="num font-medium" data-testid="meta-cost">
                        {formatMoney(r.summary.cost, display)}
                      </p>
                      <p className="num text-[11px] text-ink-3">budget {formatMoney(r.summary.budget, display)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 md:justify-end">
                    {r.pending > 0 && <span className="text-xs text-caution">{r.pending} lines to fix</span>}
                    <CopyToDecks metaId={r.id} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
