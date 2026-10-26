import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { addDays, dayKey } from "@/config/app";
import { affectedCardIds, RULING_LABEL, type RulingType } from "@/lib/rulings/service";
import { priceImpact } from "@/lib/rulings/rotation";
import { getFx, getSettings } from "@/lib/portfolio/data";
import { convert, formatMoney } from "@/lib/money/money";
import { SOURCE_SERIES_COLOR } from "@/config/chartColors";
import { LineChart } from "@/components/charts/LineChart";
import { Delta } from "@/components/money/Money";
import { ErrataDiff } from "@/components/cards/ErrataDiff";
import { cn } from "@/lib/ui";
import { DeleteRulingButton } from "./DeleteRulingButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ruling" };

export default async function RulingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const ruling = await db.rulingEvent.findUnique({ where: { id } });
  if (!ruling) notFound();
  const userId = await getCurrentUserId();
  const settings = await getSettings(db, userId);
  const fx = await getFx(db, settings.fxOverrides);
  const display = settings.displayCurrency;
  const day = dayKey(ruling.effectiveOn);

  const ids = await affectedCardIds(db, ruling);
  const listed = new Set((await db.rulingEventCard.findMany({ where: { rulingId: id }, select: { cardId: true } })).map((c) => c.cardId));
  const [cards, lots, deckCards] = await Promise.all([
    db.card.findMany({ where: { id: { in: ids } }, include: { variants: { select: { id: true, imageUrl: true, finish: true, art: true } } }, orderBy: { name: "asc" } }),
    db.lot.findMany({ where: { userId, remainingQuantity: { gt: 0 }, variant: { cardId: { in: ids } } }, select: { remainingQuantity: true, variant: { select: { cardId: true } } } }),
    db.deckCard.findMany({ where: { cardId: { in: ids }, deck: { userId } }, select: { cardId: true, deck: { select: { id: true, name: true } } } }),
  ]);
  const owned = new Map<string, number>();
  for (const l of lots) owned.set(l.variant.cardId, (owned.get(l.variant.cardId) ?? 0) + l.remainingQuantity);
  const decks = new Map<string, { id: string; name: string }[]>();
  for (const dc of deckCards) decks.set(dc.cardId, [...(decks.get(dc.cardId) ?? []), dc.deck]);

  // Rotation rulings cover a whole set: show the cards you own or play, not all of them.
  const shown = ruling.type === "ROTATION" ? cards.filter((c) => owned.has(c.id) || decks.has(c.id)) : cards.filter((c) => listed.has(c.id) || owned.has(c.id));

  // Price impact: base standard-art printing of each shown card, TCGplayer market, ±30 days.
  const baseVariant = new Map(shown.map((c) => [c.id, (c.variants.find((v) => v.imageUrl === c.imageUrl && v.art === "STANDARD") ?? c.variants[0])?.id]));
  const snaps = await db.priceSnapshot.findMany({
    where: { variantId: { in: [...baseVariant.values()].filter(Boolean) as string[] }, source: "TCGPLAYER", day: { gte: addDays(day, -30), lte: addDays(day, 30) } },
    orderBy: { day: "asc" },
  });
  const conv = (a: number, c: string) => (fx.table[c] && fx.table[display] ? convert(a, c, display, fx.table) : null);
  const seriesFor = (variantId?: string) =>
    snaps
      .filter((s) => s.variantId === variantId && s.market != null)
      .map((s) => ({ day: s.day, amount: conv(s.market!, s.currency) }))
      .filter((p): p is { day: string; amount: number } => p.amount != null);
  const first = shown[0];
  const firstSeries = first ? seriesFor(baseVariant.get(first.id)) : [];

  return (
    <div className="mx-auto max-w-[880px] px-4 py-6 md:px-8 md:py-8">
      <Link href="/news?tab=rulings" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> Errata, bans &amp; rotation
      </Link>
      {saved != null && (
        <p role="status" className="mb-5 flex items-center gap-2 rounded-[var(--radius-panel)] border border-gain/30 bg-gain-tint px-4 py-3 text-sm text-gain">
          <CheckCircle2 size={16} aria-hidden /> Saved. {Number(saved) ? `${saved} alert${saved === "1" ? "" : "s"} sent.` : "None of your cards are affected."}
        </p>
      )}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm">
            <span className={cn("rounded-[3px] px-1.5 py-0.5 text-[11px] font-medium", ruling.type === "BAN" ? "bg-loss-tint text-loss" : ruling.type === "ERRATA" ? "bg-caution-tint text-caution" : "bg-inset text-ink-2")}>
              {RULING_LABEL[ruling.type as RulingType]}
            </span>
            <span className="num text-ink-3">takes effect {day}</span>
          </p>
          <h1 className="mt-2 text-[26px] leading-tight font-semibold tracking-[-0.015em]">{ruling.title}</h1>
          {ruling.setCode && <p className="mt-1 text-sm text-ink-2">Set {ruling.setCode} leaves Standard on {day}.</p>}
          {ruling.sourceUrl && (
            <a href={ruling.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-quill hover:underline">
              Source <ExternalLink size={13} aria-hidden />
            </a>
          )}
        </div>
        <DeleteRulingButton id={ruling.id} />
      </div>

      {ruling.summary && <p className="mb-6 max-w-prose text-[15px] leading-relaxed">{ruling.summary}</p>}
      {ruling.type === "ERRATA" && ruling.newText && (
        <section className="mb-6 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4" aria-label="Text change">
          <ErrataDiff oldText={ruling.oldText ?? ""} newText={ruling.newText} />
        </section>
      )}

      <section aria-labelledby="aff-h">
        <h2 id="aff-h" className="mb-3 text-base font-semibold">
          {ruling.type === "ROTATION" ? "Your cards in this set" : "Affected cards"}
        </h2>
        {shown.length === 0 ? (
          <p className="rounded-[var(--radius-panel)] border border-dashed border-rule-strong px-4 py-5 text-center text-sm text-ink-3">You don&apos;t own or play any of these cards.</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-panel)] border border-rule bg-sheet">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="eyebrow border-b border-rule text-left">
                  <th className="px-4 py-2 font-medium">Card</th>
                  <th className="px-3 py-2 text-right font-medium">You own</th>
                  <th className="px-3 py-2 font-medium">In decks</th>
                  <th className="px-3 py-2 text-right font-medium">30d before</th>
                  <th className="px-3 py-2 text-right font-medium">30d after</th>
                  <th className="px-4 py-2 text-right font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 200).map((c) => {
                  const imp = priceImpact(seriesFor(baseVariant.get(c.id)), day);
                  return (
                    <tr key={c.id} className="border-b border-rule-soft last:border-b-0">
                      <td className="px-4 py-2">
                        <Link href={`/cards/${c.id}`} className="font-medium hover:text-quill">
                          {c.name}
                        </Link>
                      </td>
                      <td className="num px-3 py-2 text-right">{owned.get(c.id) ?? 0}</td>
                      <td className="px-3 py-2 text-xs">
                        {(decks.get(c.id) ?? []).map((d, i) => (
                          <span key={d.id}>
                            {i > 0 && ", "}
                            <Link href={`/decks/${d.id}`} className="text-quill hover:underline">
                              {d.name}
                            </Link>
                          </span>
                        ))}
                      </td>
                      <td className="num px-3 py-2 text-right text-ink-2">{imp.before != null ? formatMoney(imp.before, display) : "—"}</td>
                      <td className="num px-3 py-2 text-right text-ink-2">{imp.after != null ? formatMoney(imp.after, display) : "—"}</td>
                      <td className="px-4 py-2 text-right">
                        <Delta amount={null} pct={imp.changePct} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-ink-3">Price impact compares the average TCGplayer market price of the base printing in the 30 days before and after the ruling. It fills in as daily prices accumulate.</p>
      </section>

      {first && firstSeries.length > 0 && (
        <section className="mt-6 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4" aria-labelledby="imp-h">
          <h2 id="imp-h" className="mb-3 text-base font-semibold">
            {first.name} around the ruling
          </h2>
          <LineChart
            ariaLabel={`${first.name} price 30 days either side of ${day}`}
            series={[{ id: "tcg", name: "TCGplayer market", color: SOURCE_SERIES_COLOR.TCGPLAYER, points: firstSeries.map((p) => ({ day: p.day, value: p.amount })) }]}
            currency={display}
            today={dayKey()}
            defaultRange="ALL"
            height={200}
          />
        </section>
      )}
    </div>
  );
}
