import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { dayKey } from "@/config/app";
import { deckLinesFromRows, loadBannedNames, loadDeckCards, loadPrintingArt } from "@/lib/decks/data";
import { validateDeck } from "@/lib/decks/validate";
import { deckStats } from "@/lib/decks/stats";
import { CardArt } from "@/components/cards/bits";
import { DomainStripe } from "@/components/cards/DomainStripe";
import { DeckGallery } from "@/components/decks/DeckGallery";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared deck", robots: { index: false } };

// Read-only view of a shared deck. Shows the cards only — never prices, ownership or the owner.
export default async function SharedDeckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const deck = await db.deck.findUnique({ where: { shareToken: token }, include: { cards: true } });
  if (!deck) notFound();
  const lines = deckLinesFromRows(deck.cards);
  const cards = await loadDeckCards(db, [...new Set(lines.map((l) => l.cardId))]);
  // Chosen printings only (their art); no prices on a shared page.
  const printings = await loadPrintingArt(db, lines.flatMap((l) => (l.preferredVariantId ? [l.preferredVariantId] : [])));
  const v = validateDeck(lines, cards, { today: dayKey(), bannedNames: await loadBannedNames(db) });
  const stats = deckStats(lines, cards);
  const legend = lines.find((l) => l.section === "LEGEND");
  const lc = legend ? cards.get(legend.cardId) : undefined;
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex flex-wrap items-end gap-4">
        {lc && (
          <span className="relative w-20 shrink-0">
            <CardArt src={printings.get(lc.cardId)?.find((x) => x.variantId === legend?.preferredVariantId)?.imageUrl ?? lc.imageUrl ?? null} alt={lc.name} className="rounded-[6px]" />
            <DomainStripe domains={lc.domains} className="absolute inset-x-2 top-0 h-[3px]" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Shared deck · read only</p>
          <h1 className="mt-1 text-[28px] leading-tight font-semibold tracking-[-0.015em]">{deck.name}</h1>
          <p className="mt-1 text-sm text-ink-3">
            {lc?.name ?? "No Legend"} · <span className={v.legal ? "text-gain" : "text-loss"}>{v.legal ? "✓ Legal in Standard" : `✕ ${v.issues.length} legality issues`}</span> · average energy{" "}
            <span className="num">{stats.averageEnergy?.toFixed(2) ?? "—"}</span>
          </p>
        </div>
        <a href={`/decks/${deck.id}/export?format=txt&share=${token}`} download className="text-sm text-quill hover:underline">
          Download list
        </a>
      </div>
      <DeckGallery lines={lines} cards={cards} printings={new Map([...printings].map(([id, variants]) => [id, { variants }]))} cardLinks={false} />
    </div>
  );
}
