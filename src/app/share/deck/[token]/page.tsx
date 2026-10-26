import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { dayKey } from "@/config/app";
import { deckLinesFromRows, loadBannedNames, loadDeckCards } from "@/lib/decks/data";
import { validateDeck } from "@/lib/decks/validate";
import { deckStats } from "@/lib/decks/stats";
import { SECTION_LABEL, SECTIONS } from "@/lib/decks/types";
import { CardArt } from "@/components/cards/bits";
import { DomainStripe } from "@/components/cards/DomainStripe";
import { cn } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared deck", robots: { index: false } };

// Read-only view of a shared deck. Shows the list only — never prices, ownership or the owner.
export default async function SharedDeckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const deck = await db.deck.findUnique({ where: { shareToken: token }, include: { cards: true } });
  if (!deck) notFound();
  const lines = deckLinesFromRows(deck.cards);
  const cards = await loadDeckCards(db, [...new Set(lines.map((l) => l.cardId))]);
  const v = validateDeck(lines, cards, { today: dayKey(), bannedNames: await loadBannedNames(db) });
  const stats = deckStats(lines, cards);
  const legend = lines.find((l) => l.section === "LEGEND");
  const lc = legend ? cards.get(legend.cardId) : undefined;
  return (
    <div className="mx-auto max-w-[960px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex flex-wrap items-end gap-4">
        {lc && (
          <span className="relative w-20 shrink-0">
            <CardArt src={lc.imageUrl ?? null} alt={lc.name} className="rounded-[6px]" />
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
      <div className="columns-1 gap-6 sm:columns-2">
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
                  return (
                    <li key={`${s}${l.cardId}`} className="flex items-center gap-3 border-b border-rule-soft px-3 py-1.5 last:border-b-0">
                      <span className="num w-5 text-sm font-medium">{l.quantity}</span>
                      <span className={cn("min-w-0 flex-1 truncate text-sm")}>{c.name}</span>
                      <span className="num text-xs text-ink-3">{c.energy ?? ""}</span>
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
