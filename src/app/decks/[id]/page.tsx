import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { dayKey } from "@/config/app";
import { getFx, getPriceSeries, getSettings, missingRates, seriesDays } from "@/lib/portfolio/data";
import { priceOn } from "@/lib/portfolio/compute";
import { deckLinesFromRows, loadBannedNames, loadDeckCards, loadDeckPricing, loadOwned } from "@/lib/decks/data";
import { formatDiff, type DiffEntry } from "@/lib/decks/diff";
import { winRates } from "@/lib/decks/winrate";
import type { UnrecognizedLine } from "@/lib/decks/resolve";
import { SOURCE_LABEL } from "@/lib/domain/enums";
import { convert } from "@/lib/money/money";
import { VALUE_COLOR } from "@/config/chartColors";
import { LineChart } from "@/components/charts/LineChart";
import { FxMissing } from "@/components/money/FxMissing";
import { cn } from "@/lib/ui";
import { DeckEditor } from "./DeckEditor";
import { deckRulingBadges } from "@/lib/rulings/service";
import { nextRotation, rotationLabel } from "@/lib/rulings/rotation";
import { DeleteMatchButton, ExportShare, MatchForm, PendingImport, RestoreButton } from "./DeckSide";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const deck = await db.deck.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: deck?.name ?? "Deck" };
}

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  const deck = await db.deck.findFirst({
    where: { id, userId },
    include: { cards: true, versions: { orderBy: { version: "desc" }, take: 30 }, matches: { orderBy: [{ playedOn: "desc" }, { id: "desc" }] } },
  });
  if (!deck) notFound();
  const settings = await getSettings(db, userId);
  const fx = await getFx(db, settings.fxOverrides);
  const display = settings.displayCurrency;
  const today = dayKey();
  const lines = deckLinesFromRows(deck.cards);
  const cardIds = [...new Set(lines.map((l) => l.cardId))];

  if (missingRates(fx.table, [display]).length) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-8">
        <FxMissing />
      </div>
    );
  }

  const [cards, pricing, owned, banned, legendCards] = await Promise.all([
    loadDeckCards(db, cardIds),
    loadDeckPricing(db, userId, cardIds, settings.defaultValuationSource, fx.table, display),
    loadOwned(db, userId, cardIds),
    loadBannedNames(db),
    db.card.findMany({ where: { type: "Legend" }, select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  const pending: UnrecognizedLine[] = JSON.parse(deck.pendingImportLines);

  // Price history of the whole deck: chosen (or default) printing of every card × copies, per price day.
  const pricedVariant = new Map<string, string>();
  for (const l of lines) {
    const pr = pricing.get(l.cardId);
    const v = l.preferredVariantId ?? pr?.defaultVariantId;
    if (v) pricedVariant.set(l.cardId, v);
  }
  const series = await getPriceSeries(db, userId, [...new Set(pricedVariant.values())], settings.defaultValuationSource);
  const qtyByCard = new Map<string, number>();
  for (const l of lines) qtyByCard.set(l.cardId, (qtyByCard.get(l.cardId) ?? 0) + l.quantity);
  const history = seriesDays(series).map((day) => {
    let value = 0;
    for (const [cardId, q] of qtyByCard) {
      const p = priceOn(series.get(pricedVariant.get(cardId) ?? ""), day);
      if (p && fx.table[p.currency]) value += convert(p.amount, p.currency, display, fx.table) * q;
    }
    return { day, value };
  });

  const wr = winRates(deck.matches);
  const badges = await deckRulingBadges(db, cardIds);
  const nextRot = nextRotation(today, [...cards.values()].map((c) => c.rotatesOn));
  const notices = {
    errata: badges.errata,
    rotation: nextRot
      ? (() => {
          const n = [...cards.values()].filter((c) => c.rotatesOn === nextRot).length;
          return { date: nextRot, label: rotationLabel(today, nextRot, n !== 1), cards: n };
        })()
      : null,
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
      <Link href="/decks" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> Decks
      </Link>

      <PendingImport deckId={deck.id} lines={pending} />

      <DeckEditor
        deckId={deck.id}
        initialName={deck.name}
        initialLines={lines}
        cards={[...cards.values()]}
        pricing={[...pricing.values()]}
        owned={[...owned.entries()]}
        bannedNames={banned}
        today={today}
        currency={display}
        sourceLabel={SOURCE_LABEL[settings.defaultValuationSource] ?? settings.defaultValuationSource}
        notices={notices}
      />

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="hist-h" className="rounded-[var(--radius-panel)] border border-rule bg-sheet p-4 sm:p-5">
            <h2 id="hist-h" className="mb-3 text-base font-semibold">
              Deck value over time
            </h2>
            <LineChart
              ariaLabel={`Value of ${deck.name} over time`}
              series={[{ id: "deck", name: `Deck value (${SOURCE_LABEL[settings.defaultValuationSource] ?? ""})`, color: VALUE_COLOR, points: history }]}
              currency={display}
              today={today}
              defaultRange="ALL"
              height={200}
            />
          </section>

          <section aria-labelledby="matches-h">
            <h2 id="matches-h" className="mb-3 text-base font-semibold">
              Match log
            </h2>
            <div className="rounded-[var(--radius-panel)] border border-rule bg-sheet p-4">
              <MatchForm deckId={deck.id} today={today} legends={legendCards.map((l) => l.name)} />
            </div>
            {wr.overall.games > 0 && (
              <div className="mt-4 grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="rounded-[var(--radius-panel)] border border-rule bg-sheet p-4" data-testid="winrate-overall">
                  <p className="eyebrow">Win rate</p>
                  <p className="num mt-1 text-[32px] leading-none font-medium">{wr.overall.winRate!.toFixed(0)}%</p>
                  <p className="num mt-2 text-sm text-ink-3">
                    {wr.overall.wins}W · {wr.overall.losses}L{wr.overall.draws ? ` · ${wr.overall.draws}D` : ""} — {wr.overall.games} games
                  </p>
                </div>
                <div className="overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-sheet">
                  <table className="w-full text-sm" data-testid="winrate-by-legend">
                    <caption className="sr-only">Win rate by opponent Legend</caption>
                    <thead>
                      <tr className="eyebrow border-b border-rule text-left">
                        <th className="px-4 py-2 font-medium">Opponent Legend</th>
                        <th className="px-3 py-2 text-right font-medium">Games</th>
                        <th className="px-3 py-2 text-right font-medium">W–L–D</th>
                        <th className="px-4 py-2 text-right font-medium">Win %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wr.byOpponent.map((o) => (
                        <tr key={o.opponentLegend} className="border-b border-rule-soft last:border-b-0">
                          <td className="px-4 py-2">{o.opponentLegend}</td>
                          <td className="num px-3 py-2 text-right">{o.games}</td>
                          <td className="num px-3 py-2 text-right text-ink-2">
                            {o.wins}–{o.losses}–{o.draws}
                          </td>
                          <td className="num px-4 py-2 text-right font-medium">{o.winRate!.toFixed(0)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {deck.matches.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-ink-3 hover:text-ink">All {deck.matches.length} matches</summary>
                <ul className="mt-2 overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-sheet">
                  {deck.matches.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 border-b border-rule-soft px-4 py-2 last:border-b-0">
                      <span className="num w-24 shrink-0 text-xs text-ink-3">{dayKey(m.playedOn)}</span>
                      <span className={cn("w-12 shrink-0 text-xs font-medium", m.result === "WIN" ? "text-gain" : m.result === "LOSS" ? "text-loss" : "text-ink-3")}>
                        {m.result === "WIN" ? "▲ Win" : m.result === "LOSS" ? "▼ Loss" : "■ Draw"}
                      </span>
                      <span className="min-w-0 flex-1 truncate">vs {m.opponentLegend}</span>
                      <span className="hidden text-xs text-ink-3 sm:inline">{m.eventType.toLowerCase()}</span>
                      <DeleteMatchButton matchId={m.id} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="versions-h" className="rounded-[var(--radius-panel)] border border-rule bg-sheet p-4" data-testid="versions">
            <h2 id="versions-h" className="eyebrow mb-3">
              Versions
            </h2>
            <ol className="space-y-3">
              {deck.versions.map((v, i) => {
                const diff: DiffEntry[] = JSON.parse(v.diff);
                return (
                  <li key={v.id} className="text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">
                        v{v.version}
                        {i === 0 && <span className="ml-1.5 text-xs font-normal text-ink-3">current</span>}
                      </span>
                      <span className="num text-xs text-ink-3">{v.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-2" data-testid="version-diff">
                      {v.version === 1 && !diff.length ? "Created" : diff.length ? formatDiff(diff) : "Printing or proxy changes"}
                    </p>
                    {i > 0 && <RestoreButton deckId={deck.id} version={v.version} />}
                  </li>
                );
              })}
            </ol>
          </section>
          <section aria-labelledby="export-h" className="rounded-[var(--radius-panel)] border border-rule bg-sheet p-4">
            <h2 id="export-h" className="eyebrow mb-3">
              Export &amp; share
            </h2>
            <ExportShare
              deckId={deck.id}
              deckName={deck.name}
              shareToken={deck.shareToken}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
