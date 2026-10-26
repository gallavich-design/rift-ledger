import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { CardArt, DomainChip, Ticker } from "@/components/cards/bits";
import { DomainStripe } from "@/components/cards/DomainStripe";
import { RulesText } from "@/components/cards/RulesText";
import { pipeSplit } from "@/lib/catalog/grouping";
import { ART_LABEL, type VariantArt } from "@/lib/domain/enums";
import { cn } from "@/lib/ui";

export const dynamic = "force-dynamic";

const ART_ORDER: VariantArt[] = ["STANDARD", "ALTERNATE", "OVERNUMBERED", "SIGNATURE", "METAL", "PROMO"];

async function load(id: string) {
  return db.card.findUnique({
    where: { id },
    include: {
      set: true,
      variants: { include: { set: true } },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const card = await load((await params).id);
  return { title: card?.name ?? "Card" };
}

export default async function CardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { id } = await params;
  const { v } = await searchParams;
  const card = await load(id);
  if (!card) notFound();

  const variants = [...card.variants].sort(
    (a, b) =>
      (a.set.releaseDate?.getTime() ?? 0) - (b.set.releaseDate?.getTime() ?? 0) ||
      ART_ORDER.indexOf(a.art as VariantArt) - ART_ORDER.indexOf(b.art as VariantArt) ||
      (a.collectorNumber ?? 0) - (b.collectorNumber ?? 0),
  );
  const selected = variants.find((x) => x.id === v) ?? variants.find((x) => x.imageUrl === card.imageUrl) ?? variants[0];
  const domains = pipeSplit(card.domains);
  const landscape = card.orientation === "landscape";
  const stats = [
    { label: "Energy", value: card.energy },
    { label: "Might", value: card.might },
    { label: "Power", value: card.power },
  ].filter((s) => s.value != null);
  const typeLine = [card.supertype, card.type].filter(Boolean).join(" ");

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
      <Link href="/cards" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> Cards
      </Link>

      <div className={cn("grid gap-8", landscape ? "lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]" : "md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]")}>
        {/* Hero art */}
        <div className="md:sticky md:top-6 md:self-start">
          <div className="relative mx-auto max-w-[240px] sm:max-w-[320px] md:max-w-none">
            <CardArt src={selected?.imageUrl ?? card.imageUrl} alt={selected?.printName ?? card.name} landscape={landscape} priority />
            <DomainStripe domains={domains} className="absolute inset-x-5 top-0 h-1 overflow-hidden rounded-b-[2px]" />
          </div>
          {selected?.artist && <p className="mt-2 text-center text-xs text-ink-3">Art by {selected.artist}</p>}
        </div>

        {/* Facts */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Ticker setCode={card.set.code} number={card.collectorNumber} />
            {card.rarity && <span className="text-xs text-ink-3">{card.rarity}</span>}
          </div>
          <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-[-0.015em] md:text-[32px]">{card.name}</h1>
          <p className="mt-1 text-ink-2">{typeLine}</p>

          {domains.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {domains.map((d) => (
                <DomainChip key={d} name={d} />
              ))}
            </div>
          )}

          {stats.length > 0 && (
            <dl className="mt-6 grid max-w-sm grid-cols-3 divide-x divide-rule rounded-[var(--radius-panel)] border border-rule bg-sheet">
              {stats.map((s) => (
                <div key={s.label} className="px-4 py-3">
                  <dt className="eyebrow">{s.label}</dt>
                  <dd className="num mt-1 text-2xl font-medium">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <section className="mt-6 rounded-[var(--radius-panel)] border border-rule bg-sheet p-5" aria-labelledby="rules-h">
            <h2 id="rules-h" className="eyebrow mb-3">
              Rules text
            </h2>
            <RulesText rich={card.rulesTextRich} plain={card.rulesText} />
            {card.flavourText && <p className="mt-4 border-t border-rule-soft pt-3 text-sm text-ink-3 italic">{card.flavourText}</p>}
          </section>

          <section className="mt-8" aria-labelledby="printings-h">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="printings-h" className="text-lg font-semibold">
                Printings
              </h2>
              <span className="num text-sm text-ink-3">{variants.length}</span>
            </div>
            <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-sheet">
              {variants.map((p) => {
                const isSel = p.id === selected?.id;
                return (
                  <li key={p.id} className="border-b border-rule-soft last:border-b-0">
                    <div className={cn("flex items-center gap-3 px-3 py-2.5 sm:px-4", isSel && "bg-quill-tint/60")}>
                      <Link
                        href={`/cards/${card.id}?v=${p.id}`}
                        scroll={false}
                        aria-current={isSel ? "true" : undefined}
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        <span className={cn("w-10 shrink-0", landscape && "w-14")}>
                          <CardArt src={p.imageUrl} alt="" landscape={landscape} className="rounded-[4px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate text-sm", isSel ? "font-medium text-quill" : "text-ink")}>
                            {ART_LABEL[p.art as VariantArt] ?? p.art}
                            <span className="text-ink-3"> · {p.set.name}</span>
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                            <Ticker setCode={p.set.code} number={p.collectorNumber} />
                            {p.rarity && <span>{p.rarity}</span>}
                            <span>{p.finish === "FOIL" ? "Foil" : "Normal"}</span>
                            <span className="num">{p.language}</span>
                            {p.gradingCompany && (
                              <span className="num">
                                {p.gradingCompany} {p.grade}
                              </span>
                            )}
                          </span>
                        </span>
                      </Link>
                      {p.tcgplayerId && (
                        <a
                          href={`https://www.tcgplayer.com/product/${p.tcgplayerId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hidden shrink-0 items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 text-xs text-ink-3 hover:bg-hover hover:text-ink sm:inline-flex"
                        >
                          TCGplayer <ExternalLink size={12} aria-hidden />
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-ink-3">
              Card data from Riftcodex · synced{" "}
              <time dateTime={card.updatedAt.toISOString()} className="num">
                {card.updatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC
              </time>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
