import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { dayKey } from "@/config/app";
import { getFx, getSettings } from "@/lib/portfolio/data";
import { loadDeckCards, loadDeckPricing, loadOwned } from "@/lib/decks/data";
import { costDeck } from "@/lib/decks/cost";
import { SECTION_LABEL, SECTIONS, type DeckLine, type Section } from "@/lib/decks/types";
import type { UnrecognizedLine } from "@/lib/decks/resolve";
import { formatMoney } from "@/lib/money/money";
import { CardArt } from "@/components/cards/bits";
import { cn } from "@/lib/ui";
import { CopyToDecks, DeleteMeta, MetaPending } from "../MetaControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meta deck" };

export default async function MetaDeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  const meta = await db.metaDeck.findFirst({ where: { id, userId }, include: { cards: true } });
  if (!meta) notFound();
  const settings = await getSettings(db, userId);
  const fx = await getFx(db, settings.fxOverrides);
  const display = settings.displayCurrency;
  const lines: DeckLine[] = meta.cards.map((c) => ({ cardId: c.cardId, section: c.section as Section, quantity: c.quantity, proxyQuantity: 0 }));
  const ids = [...new Set(lines.map((l) => l.cardId))];
  const [cards, pricing, owned] = await Promise.all([
    loadDeckCards(db, ids),
    fx.table[display] ? loadDeckPricing(db, userId, ids, settings.defaultValuationSource, fx.table, display) : Promise.resolve(new Map()),
    loadOwned(db, userId, ids),
  ]);
  const cost = costDeck(lines, owned, pricing);
  const byCard = new Map(cost.lines.map((l) => [l.cardId, l]));
  const pending: UnrecognizedLine[] = JSON.parse(meta.pendingImportLines);

  return (
    <div className="mx-auto max-w-[960px] px-4 py-6 md:px-8 md:py-8">
      <Link href="/meta" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> Meta
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.015em]">{meta.archetype}</h1>
          <p className="mt-1 text-sm text-ink-3">
            {meta.event}
            {meta.placement && <> · {meta.placement}</>}
            {meta.playedOn && <> · {dayKey(meta.playedOn)}</>}
            {meta.sourceUrl && (
              <>
                {" · "}
                <a href={meta.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-quill hover:underline">
                  source <ExternalLink size={12} aria-hidden />
                </a>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <CopyToDecks metaId={meta.id} />
          <DeleteMeta metaId={meta.id} />
        </div>
      </div>

      <MetaPending metaId={meta.id} lines={pending} />

      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-rule sm:grid-cols-4">
        {[
          ["You own", `${cost.copies ? ((cost.ownedCopies / cost.copies) * 100).toFixed(0) : 0}%`, `${cost.ownedCopies} of ${cost.copies} cards`],
          ["Missing", String(cost.missingCopies), "copies"],
          ["To complete", formatMoney(cost.costToComplete, display), `deck value ${formatMoney(cost.value, display)}`],
          ["Budget", formatMoney(cost.budgetCostToComplete, display), "cheapest printings"],
        ].map(([l, v, h]) => (
          <div key={l} className="bg-sheet px-4 py-3">
            <dt className="eyebrow">{l}</dt>
            <dd className="num mt-1 text-lg font-medium">{v}</dd>
            <dd className="text-xs text-ink-3">{h}</dd>
          </div>
        ))}
      </dl>

      <div className="columns-1 gap-6 md:columns-2">
        {SECTIONS.map((s) => {
          const ls = lines.filter((l) => l.section === s).sort((a, b) => (cards.get(a.cardId)?.energy ?? 99) - (cards.get(b.cardId)?.energy ?? 99));
          if (!ls.length) return null;
          return (
            <section key={s} className="mb-6 break-inside-avoid">
              <h2 className="eyebrow mb-2 flex justify-between">
                {SECTION_LABEL[s]} <span className="num">{ls.reduce((a, l) => a + l.quantity, 0)}</span>
              </h2>
              <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-sheet">
                {ls.map((l) => {
                  const c = cards.get(l.cardId)!;
                  const cl = byCard.get(l.cardId);
                  const have = Math.min(owned.get(l.cardId) ?? 0, cl?.quantity ?? l.quantity);
                  return (
                    <li key={`${s}${l.cardId}`} className="flex items-center gap-3 border-b border-rule-soft px-3 py-2 last:border-b-0">
                      <span className="w-7 shrink-0">
                        <CardArt src={c.imageUrl ?? null} alt="" className="rounded-[3px]" />
                      </span>
                      <span className="num w-5 text-sm font-medium">{l.quantity}</span>
                      <Link href={`/cards/${c.cardId}`} className="min-w-0 flex-1 truncate text-sm hover:text-quill">
                        {c.name}
                      </Link>
                      <span className={cn("num shrink-0 text-xs", cl && cl.missing ? "text-caution" : "text-gain")}>
                        {cl && cl.missing ? `need ${cl.missing}` : "✓ owned"}
                        <span className="sr-only"> (you own {have})</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
