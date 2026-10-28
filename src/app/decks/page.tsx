import Link from "next/link";
import { Check, X } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { dayKey } from "@/config/app";
import { getFx, getSettings } from "@/lib/portfolio/data";
import { deckLinesFromRows, loadBannedNames, loadDeckCards, loadDeckPricing, loadOwned } from "@/lib/decks/data";
import { validateDeck } from "@/lib/decks/validate";
import { costDeck } from "@/lib/decks/cost";
import { winRates } from "@/lib/decks/winrate";
import { formatMoney } from "@/lib/money/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { CardArt } from "@/components/cards/bits";
import { DomainStripe } from "@/components/cards/DomainStripe";
import { cn } from "@/lib/ui";
import { nextRotation, rotationLabel } from "@/lib/rulings/rotation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Decks" };

export default async function DecksPage() {
  const userId = await getCurrentUserId();
  const decks = await db.deck.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, include: { cards: { include: { preferredVariant: { select: { imageUrl: true } } } }, matches: { select: { opponentLegend: true, result: true } } } });
  const settings = await getSettings(db, userId);
  const fx = await getFx(db, settings.fxOverrides);
  const display = settings.displayCurrency;
  const cardIds = [...new Set(decks.flatMap((d) => d.cards.map((c) => c.cardId)))];
  const canPrice = !!fx.table[display];
  const [cards, pricing, owned, banned] = await Promise.all([
    loadDeckCards(db, cardIds),
    canPrice ? loadDeckPricing(db, userId, cardIds, settings.defaultValuationSource, fx.table, display) : Promise.resolve(new Map()),
    loadOwned(db, userId, cardIds),
    loadBannedNames(db),
  ]);
  const today = dayKey();

  return (
    <div className="mx-auto max-w-[1080px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Decks"
        actions={
          <Button asChild>
            <Link href="/decks/new">New deck</Link>
          </Button>
        }
      />
      {decks.length === 0 ? (
        <EmptyState title="No decks yet" body="Paste a decklist or start from a Legend — you'll see what it costs and what you already own." action={{ href: "/decks/new", label: "New deck" }} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {decks.map((d) => {
            const lines = deckLinesFromRows(d.cards);
            const v = validateDeck(lines, cards, { today, bannedNames: banned });
            const c = costDeck(lines, owned, pricing);
            const legend = lines.find((l) => l.section === "LEGEND");
            const lc = legend ? cards.get(legend.cardId) : undefined;
            const wr = winRates(d.matches).overall;
            const pending = (JSON.parse(d.pendingImportLines) as unknown[]).length;
            const rot = nextRotation(today, lines.map((l) => cards.get(l.cardId)?.rotatesOn));
            const hasBanned = v.issues.some((i) => i.rule === "BANNED");
            return (
              <li key={d.id}>
                <Link href={`/decks/${d.id}`} className="flex gap-4 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4 hover:border-rule-strong" data-testid="deck-card">
                  <span className="relative w-16 shrink-0">
                    <CardArt src={(legend ? d.cards.find((c) => c.section === "LEGEND" && c.cardId === legend.cardId)?.preferredVariant?.imageUrl : null) ?? lc?.imageUrl ?? null} alt="" className="rounded-[6px]" />
                    {lc && <DomainStripe domains={lc.domains} className="absolute inset-x-1.5 top-0 h-[3px]" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="truncate text-[15px] font-semibold">{d.name}</span>
                      <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", v.legal ? "bg-gain-tint text-gain" : "bg-loss-tint text-loss")}>
                        {v.legal ? <Check size={12} aria-hidden /> : <X size={12} aria-hidden />}
                        {v.legal ? "Legal" : `${v.issues.length} ${v.issues.length === 1 ? "issue" : "issues"}`}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-3">{lc?.name ?? "No Legend yet"}</span>
                    <span className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <span>
                        <span className="block text-ink-3">Value</span>
                        <span className="num text-sm text-ink">{canPrice ? formatMoney(c.value, display) : "—"}</span>
                      </span>
                      <span>
                        <span className="block text-ink-3">To complete</span>
                        <span className="num text-sm text-ink">{canPrice ? formatMoney(c.costToComplete, display) : "—"}</span>
                      </span>
                      <span>
                        <span className="block text-ink-3">Win rate</span>
                        <span className="num text-sm text-ink">{wr.winRate != null ? `${wr.winRate.toFixed(0)}%` : "—"}</span>
                      </span>
                    </span>
                    <span className="mt-2 block text-xs text-ink-3">
                      <span className="num">{c.ownedCopies}</span>/<span className="num">{c.copies}</span> cards owned
                      {pending > 0 && <span className="text-caution"> · {pending} import lines to fix</span>}
                      {hasBanned && <span className="font-medium text-loss"> · ✕ has a banned card</span>}
                      {rot && <span> · {rotationLabel(today, rot)}</span>}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
