import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUserId, isDemoMode } from "@/lib/currentUser";
import { dayKey } from "@/config/app";
import { CardArt, DomainChip, Ticker } from "@/components/cards/bits";
import { DomainStripe } from "@/components/cards/DomainStripe";
import { RulesText } from "@/components/cards/RulesText";
import { pipeSplit } from "@/lib/catalog/grouping";
import { ART_LABEL, SOURCE_LABEL, type VariantArt } from "@/lib/domain/enums";
import { getFx, getSettings, missingRates } from "@/lib/portfolio/data";
import { conditionFactor } from "@/lib/portfolio/compute";
import { remainingCost } from "@/lib/money/fifo";
import { convert, formatMoney } from "@/lib/money/money";
import { compareImportVsLocal, landedRatioE6 } from "@/lib/portfolio/importVsLocal";
import { SOURCE_SERIES_COLOR } from "@/config/chartColors";
import { LineChart } from "@/components/charts/LineChart";
import { Delta, SourceStamp } from "@/components/money/Money";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui";
import { Disclosure, LocalPriceForm, ManualPriceForm, MoveLotSelect, RemoveCopies } from "./PriceForms";
import { AddToDeck } from "./AddToDeck";
import { QuickAdd } from "./QuickAdd";
import { suggestBinder } from "@/lib/collection/binderChoice";
import { quoteVariants } from "@/lib/prices/quote";
import { WatchForm } from "./WatchForm";
import { ErrataDiff } from "@/components/cards/ErrataDiff";
import { RULING_LABEL, type RulingType } from "@/lib/rulings/service";
import { rotationLabel } from "@/lib/rulings/rotation";
import { addDays } from "@/config/app";
import { SECTION_LABEL, type Section } from "@/lib/decks/types";

export const dynamic = "force-dynamic";

const ART_ORDER: VariantArt[] = ["STANDARD", "ALTERNATE", "OVERNUMBERED", "SIGNATURE", "METAL", "PROMO"];

async function load(id: string) {
  return db.card.findUnique({ where: { id }, include: { set: true, variants: { include: { set: true } } } });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const card = await load((await params).id);
  return { title: card?.name ?? "Card" };
}

export default async function CardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string; deck?: string }> }) {
  const { id } = await params;
  const { v, deck: watchDeckId } = await searchParams;
  const card = await load(id);
  if (!card) notFound();
  const userId = await getCurrentUserId();
  const demo = await isDemoMode();
  const settings = await getSettings(db, userId);
  const fx = await getFx(db, settings.fxOverrides);
  const today = dayKey();

  const variants = [...card.variants].sort(
    (a, b) =>
      (a.set.releaseDate?.getTime() ?? 0) - (b.set.releaseDate?.getTime() ?? 0) ||
      ART_ORDER.indexOf(a.art as VariantArt) - ART_ORDER.indexOf(b.art as VariantArt) ||
      (a.collectorNumber ?? 0) - (b.collectorNumber ?? 0) ||
      a.finish.localeCompare(b.finish),
  );
  const variantIds = variants.map((x) => x.id);

  const [snaps, localReports, manual, lots, locations, importLines, myDecks, usedIn, rulings, metaCount, watches] = await Promise.all([
    db.priceSnapshot.findMany({ where: { variantId: { in: variantIds } }, orderBy: { day: "asc" } }),
    db.localPriceReport.findMany({ where: { userId, variantId: { in: variantIds } }, orderBy: [{ seenOn: "asc" }, { createdAt: "asc" }] }),
    db.manualPrice.findMany({ where: { userId, variantId: { in: variantIds } } }),
    db.lot.findMany({ where: { userId, variantId: { in: variantIds }, remainingQuantity: { gt: 0 } }, include: { storageLocation: true, order: { select: { id: true, seller: true } } }, orderBy: { acquiredOn: "asc" } }),
    db.storageLocation.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true, type: true } }),
    db.lot.findMany({ where: { userId, order: { currency: "USD" } }, select: { quantity: true, unitPrice: true, landedTotal: true } }),
    db.deck.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true } }),
    db.deckCard.findMany({ where: { cardId: card.id, deck: { userId } }, include: { deck: { select: { id: true, name: true } } } }),
    db.rulingEvent.findMany({
      where: { OR: [{ cards: { some: { cardId: card.id } } }, { type: "ROTATION", setCode: card.set.code }] },
      orderBy: [{ effectiveOn: "desc" }, { createdAt: "desc" }],
    }),
    db.metaDeck.count({ where: { userId, cards: { some: { cardId: card.id } } } }),
    db.watchItem.findMany({ where: { userId, variantId: { in: variantIds } } }),
  ]);

  const heldByVariant = new Map<string, number>();
  for (const l of lots) heldByVariant.set(l.variantId, (heldByVariant.get(l.variantId) ?? 0) + l.remainingQuantity);
  // Default to a printing you own, else the base art.
  const selected =
    variants.find((x) => x.id === v) ?? variants.find((x) => heldByVariant.has(x.id)) ?? variants.find((x) => x.imageUrl === card.imageUrl) ?? variants[0];

  const domains = pipeSplit(card.domains);
  const landscape = card.orientation === "landscape";
  const stats = [
    { label: "Energy", value: card.energy },
    { label: "Might", value: card.might },
    { label: "Power", value: card.power },
  ].filter((s) => s.value != null);
  const typeLine = [card.supertype, card.type].filter(Boolean).join(" ");
  const display = settings.displayCurrency;
  const canConvert = missingRates(fx.table, [display, "THB"]).length === 0;
  const conv = (amount: number, currency: string) => (canConvert ? convert(amount, currency, display, fx.table) : null);

  // ── Selected printing: latest quote per source ──
  const selSnaps = snaps.filter((s) => s.variantId === selected.id);
  const latestBySource = new Map<string, (typeof snaps)[number]>();
  for (const s of selSnaps) latestBySource.set(s.source, s); // ascending → last wins
  const selLocal = localReports.filter((r) => r.variantId === selected.id);
  const latestLocal = selLocal[selLocal.length - 1];
  const selManual = manual.find((m) => m.variantId === selected.id) ?? null;
  const tcg = latestBySource.get("TCGPLAYER");

  // ── Chart: one line per source, in display currency ──
  const chartSeries = canConvert
    ? [
        ...[demo ? "DEMO" : "TCGPLAYER", "CARDMARKET"].map((src) => ({
          id: src,
          name: SOURCE_LABEL[src],
          color: SOURCE_SERIES_COLOR[src],
          points: selSnaps.filter((s) => s.source === src && (s.market ?? s.mid ?? s.low) != null).map((s) => ({ day: s.day, value: conv(s.market ?? s.mid ?? s.low!, s.currency)! })),
        })),
        {
          id: "LOCAL",
          name: SOURCE_LABEL.LOCAL,
          color: SOURCE_SERIES_COLOR.LOCAL,
          points: Object.values(Object.fromEntries(selLocal.map((r) => [dayKey(r.seenOn), { day: dayKey(r.seenOn), value: conv(r.price, r.currency)! }]))),
        },
        {
          id: "MANUAL",
          name: SOURCE_LABEL.MANUAL,
          color: SOURCE_SERIES_COLOR.MANUAL,
          dashed: true,
          points: selSnaps.filter((s) => s.source === "MANUAL" && s.market != null).map((s) => ({ day: s.day, value: conv(s.market!, s.currency)! })),
        },
      ].filter((s) => s.points.length > 0)
    : [];

  // ── Import or buy local ──
  const ivl = compareImportVsLocal({
    tcgMarketUsd: tcg?.currency === "USD" ? (tcg.market ?? tcg.mid ?? null) : null,
    ratioE6: landedRatioE6(importLines),
    localThb: latestLocal?.price ?? null,
    fx: fx.table,
    currency: "THB",
  });

  // ── Valuation quote used for "your copies" (manual > default source) ──
  const quoteFor = (variantId: string): { amount: number; currency: string; source: string } | null => {
    const m = manual.find((x) => x.variantId === variantId);
    if (m) return { amount: m.price, currency: m.currency, source: "MANUAL" };
    if (settings.defaultValuationSource === "LOCAL") {
      const r = localReports.filter((x) => x.variantId === variantId).at(-1);
      return r ? { amount: r.price, currency: r.currency, source: "LOCAL" } : null;
    }
    const s = snaps.filter((x) => x.variantId === variantId && x.source === settings.defaultValuationSource).at(-1);
    const amt = s ? (s.market ?? s.mid ?? s.low) : null;
    return s && amt != null ? { amount: amt, currency: s.currency, source: s.source } : null;
  };
  const latestTcgByVariant = new Map<string, (typeof snaps)[number]>();
  for (const s of snaps) if (s.source === "TCGPLAYER") latestTcgByVariant.set(s.variantId, s);
  const selectedHeld = heldByVariant.get(selected.id) ?? 0;
  // Market price of the selected printing for "Add to collection" (display currency, chosen source).
  const quickQuote = await quoteVariants(db, userId, demo, [selected.id]);
  const quickMarket = quickQuote.quotes[selected.id]?.unit ?? null;
  // Default binder: one named after this printing's set if you have it, else where you keep this card already, else none.
  const quickBinder = locations.some((l) => l.name.toLowerCase() === selected.set.code.toLowerCase())
    ? suggestBinder(locations, selected.set.code)
    : lots.find((l) => l.storageLocationId)?.storageLocationId
      ? { id: lots.find((l) => l.storageLocationId)!.storageLocationId! }
      : { none: true as const };
  const watch = watches.find((w) => w.variantId === selected.id) ?? null;
  const watchDeck = watchDeckId ? (myDecks.find((d) => d.id === watchDeckId) ?? null) : null;
  const rotatesOn = card.set.rotatesOn ? dayKey(card.set.rotatesOn) : null;
  const errata = rulings.find((r) => r.type === "ERRATA" && r.newText);

  // Price since release (spec §4.4): pre-order → week 1 → week 4 → now, for the selected printing.
  const release = selected.set.releaseDate ? dayKey(selected.set.releaseDate) : null;
  const tcgSel = selSnaps.filter((s) => s.source === "TCGPLAYER" && (s.market ?? s.mid ?? s.low) != null);
  const atOrAfter = (d: string) => tcgSel.find((s) => s.day >= d);
  const beforeRelease = release ? tcgSel.filter((s) => s.day < release).at(-1) : undefined;
  const sinceRelease =
    release && Date.parse(release) > Date.now() - 400 * 86_400_000
      ? [
          { label: "Pre-order", amount: watch?.preorderPrice != null ? { a: watch.preorderPrice, c: watch.currency ?? display } : beforeRelease ? { a: beforeRelease.market ?? beforeRelease.mid ?? beforeRelease.low!, c: beforeRelease.currency } : null },
          { label: "Week 1", amount: (() => { const s = atOrAfter(addDays(release, 7)); return s && s.day <= addDays(release, 13) ? { a: s.market ?? s.mid ?? s.low!, c: s.currency } : null; })() },
          { label: "Week 4", amount: (() => { const s = atOrAfter(addDays(release, 28)); return s && s.day <= addDays(release, 41) ? { a: s.market ?? s.mid ?? s.low!, c: s.currency } : null; })() },
          { label: "Now", amount: tcgSel.at(-1) ? { a: tcgSel.at(-1)!.market ?? tcgSel.at(-1)!.mid ?? tcgSel.at(-1)!.low!, c: tcgSel.at(-1)!.currency } : null },
        ]
      : null;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
      <Link href="/cards" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> Cards
      </Link>

      <div className={cn("grid gap-8", landscape ? "lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]" : "md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]")}>
        <div className="md:sticky md:top-6 md:self-start">
          <div className="relative mx-auto max-w-[240px] sm:max-w-[320px] md:max-w-none">
            <CardArt src={selected?.imageUrl ?? card.imageUrl} alt={selected?.printName ?? card.name} landscape={landscape} priority />
            <DomainStripe domains={domains} className="absolute inset-x-5 top-0 h-1 overflow-hidden rounded-b-[2px]" />
          </div>
          {selected?.artist && <p className="mt-2 text-center text-xs text-ink-3">Art by {selected.artist}</p>}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Ticker setCode={selected.set.code} number={selected.collectorNumber} />
            <span className="text-xs text-ink-3">
              {ART_LABEL[selected.art as VariantArt]} · {selected.finish === "FOIL" ? "Foil" : "Normal"} · {selected.rarity}
            </span>
          </div>
          <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-[-0.015em] md:text-[32px]">{card.name}</h1>
          {(rotatesOn || metaCount > 0 || rulings.some((r) => r.type === "BAN")) && (
            <p className="mt-2 flex flex-wrap gap-2 text-xs">
              {rotatesOn && (
                <span className={cn("rounded-full px-2.5 py-1", rotatesOn <= today ? "bg-loss-tint text-loss" : "bg-inset text-ink-2")} data-testid="rotation-chip">
                  {card.set.code} {rotationLabel(today, rotatesOn)}
                </span>
              )}
              {banState(rulings) === "BAN" && <span className="rounded-full bg-loss-tint px-2.5 py-1 font-medium text-loss">✕ Banned</span>}
              {metaCount > 0 && (
                <Link href="/meta" className="rounded-full bg-quill-tint px-2.5 py-1 text-quill hover:underline">
                  In {metaCount} meta {metaCount === 1 ? "deck" : "decks"}
                </Link>
              )}
            </p>
          )}
          <p className="mt-1 text-ink-2">{typeLine}</p>

          {/* Ticker headline: price + 1-step change for the selected printing */}
          <PriceHeadline snaps={selSnaps.filter((s) => s.source === "TCGPLAYER")} manual={selManual} conv={conv} display={display} />

          <div className="mt-4 flex flex-wrap gap-2">
            <QuickAdd
              key={selected.id}
              variantId={selected.id}
              cardName={card.name}
              printingLabel={`${selected.set.code}·${String(selected.collectorNumber ?? "").padStart(3, "0")} ${ART_LABEL[selected.art as VariantArt]} ${selected.finish === "FOIL" ? "Foil" : "Normal"}`}
              market={quickMarket}
              currency={quickQuote.currency}
              locations={locations}
              defaultBinder={quickBinder}
              today={today}
            />
            <Button asChild variant="secondary">
              <Link href={`/collection/add?variant=${selected.id}`}>Add purchase</Link>
            </Button>
            {selectedHeld > 0 && (
              <Button asChild variant="secondary">
                <Link href={`/collection/sell?variant=${selected.id}`}>Record sale</Link>
              </Button>
            )}
            <AddToDeck cardId={card.id} decks={myDecks} />
          </div>
          {usedIn.length > 0 && (
            <p className="mt-3 text-sm text-ink-2" data-testid="used-in-decks">
              In your decks:{" "}
              {usedIn.map((u, i) => (
                <span key={u.id}>
                  {i > 0 && ", "}
                  <Link href={`/decks/${u.deck.id}`} className="text-quill hover:underline">
                    {u.deck.name}
                  </Link>{" "}
                  <span className="num text-ink-3">
                    ({u.quantity}× {SECTION_LABEL[u.section as Section].toLowerCase()})
                  </span>
                </span>
              ))}
            </p>
          )}

          {domains.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {domains.map((d) => (
                <DomainChip key={d} name={d} />
              ))}
            </div>
          )}
          {stats.length > 0 && (
            <dl className="mt-4 grid max-w-sm grid-cols-3 divide-x divide-rule rounded-[var(--radius-panel)] border border-rule bg-sheet">
              {stats.map((s) => (
                <div key={s.label} className="px-4 py-3">
                  <dt className="eyebrow">{s.label}</dt>
                  <dd className="num mt-1 text-2xl font-medium">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <section className="mt-5 rounded-[var(--radius-panel)] border border-rule bg-sheet p-5" aria-labelledby="rules-h">
            <h2 id="rules-h" className="eyebrow mb-3">
              Rules text
            </h2>
            <RulesText rich={card.rulesTextRich} plain={card.rulesText} />
            {card.flavourText && <p className="mt-4 border-t border-rule-soft pt-3 text-sm text-ink-3 italic">{card.flavourText}</p>}
            {card.set.sourceId?.startsWith("tcg:") && (
              <p className="mt-4 border-t border-rule-soft pt-3 text-xs text-ink-3" data-testid="tcg-card-data">
                Card details from TCGplayer — the card database (Riftcodex) hasn&rsquo;t added {card.set.name} yet. Costs show as numbers rather than
                symbols. They switch to the official data automatically once it&rsquo;s added.
              </p>
            )}
          </section>

          {/* ── Rulings ── */}
          {rulings.length > 0 && (
            <section className="mt-6 rounded-[var(--radius-panel)] border border-rule bg-sheet p-5" aria-labelledby="rulings-h" data-testid="card-rulings">
              <h2 id="rulings-h" className="eyebrow mb-3">
                Rulings
              </h2>
              {errata && (
                <div className="mb-4">
                  <p className="mb-2 text-sm font-medium">
                    Errata · <span className="num">{dayKey(errata.effectiveOn)}</span>
                  </p>
                  <ErrataDiff oldText={errata.oldText ?? ""} newText={errata.newText!} />
                </div>
              )}
              <ul className="space-y-1.5 text-sm">
                {rulings.map((r) => (
                  <li key={r.id} className="flex gap-3">
                    <span className="num w-24 shrink-0 text-xs text-ink-3">{dayKey(r.effectiveOn)}</span>
                    <Link href={`/news/${r.id}`} className="min-w-0 flex-1 hover:text-quill">
                      <span className="font-medium">{RULING_LABEL[r.type as RulingType]}</span> — {r.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Prices ── */}
          <section id="prices" className="mt-8 scroll-mt-6" aria-labelledby="prices-h">
            <h2 id="prices-h" className="mb-3 text-lg font-semibold">
              Prices <span className="text-sm font-normal text-ink-3">· this printing</span>
            </h2>
            <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-sheet" data-testid="price-sources">
              <SourceRow label="TCGplayer (US)" testid="src-tcgplayer">
                {tcg ? (
                  <>
                    <PriceValue amount={tcg.market ?? tcg.mid ?? tcg.low!} currency={tcg.currency} display={display} conv={conv} />
                    <p className="num text-xs text-ink-3">
                      low {tcg.low != null ? formatMoney(tcg.low, "USD") : "—"} · mid {tcg.mid != null ? formatMoney(tcg.mid, "USD") : "—"}
                    </p>
                    <SourceStamp source="TCGPLAYER" asOf={tcg.capturedAt} />
                  </>
                ) : (
                  <Muted>{selected.tcgplayerId ? "No TCGplayer price yet — the daily price job adds it." : "Not listed on TCGplayer."}</Muted>
                )}
              </SourceRow>
              {latestBySource.get("CARDMARKET") && (
                <SourceRow label="Cardmarket (EU)">
                  <PriceValue amount={latestBySource.get("CARDMARKET")!.market!} currency={latestBySource.get("CARDMARKET")!.currency} display={display} conv={conv} />
                  <SourceStamp source="CARDMARKET" asOf={latestBySource.get("CARDMARKET")!.capturedAt} />
                </SourceRow>
              )}
              {latestBySource.get("DEMO") && (
                <SourceRow label="Demo prices">
                  <PriceValue amount={latestBySource.get("DEMO")!.market!} currency={latestBySource.get("DEMO")!.currency} display={display} conv={conv} />
                  <SourceStamp source="DEMO" asOf={latestBySource.get("DEMO")!.capturedAt} />
                </SourceRow>
              )}
              <SourceRow label="Local (Thailand)" testid="src-local">
                {latestLocal ? (
                  <>
                    <PriceValue amount={latestLocal.price} currency={latestLocal.currency} display={display} conv={conv} />
                    <SourceStamp source="LOCAL" asOf={latestLocal.seenOn} detail={latestLocal.whereSeen} />
                    {selLocal.length > 1 && (
                      <p className="text-xs text-ink-3">
                        <span className="num">{selLocal.length}</span> reports
                      </p>
                    )}
                  </>
                ) : (
                  <Muted>No local price reported yet.</Muted>
                )}
              </SourceRow>
              {selManual && (
                <SourceRow label="Manual override" testid="src-manual">
                  <PriceValue amount={selManual.price} currency={selManual.currency} display={display} conv={conv} />
                  <SourceStamp source="MANUAL" asOf={selManual.updatedAt} />
                  <p className="text-xs text-ink-3">Used instead of every other source when valuing this printing.</p>
                </SourceRow>
              )}
            </ul>
            <div className="mt-3 flex flex-wrap gap-3">
              <Disclosure label="Report local price">
                <LocalPriceForm variantId={selected.id} today={today} />
              </Disclosure>
              <Disclosure label={selManual ? "Edit manual price" : "Set manual price"}>
                <ManualPriceForm variantId={selected.id} current={selManual ? { amount: selManual.price, currency: selManual.currency } : null} defaultCurrency={display} />
              </Disclosure>
            </div>

            {chartSeries.length > 0 && (
              <div className="mt-4 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4">
                <LineChart ariaLabel={`Price history for ${card.name}, ${ART_LABEL[selected.art as VariantArt]} ${selected.finish.toLowerCase()}`} series={chartSeries} currency={display} today={today} defaultRange="ALL" height={220} />
              </div>
            )}

            {/* Import or buy local? */}
            <div className="mt-4 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4" data-testid="import-vs-local">
              <h3 className="eyebrow mb-3">Import or buy local?</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-ink-3">Import from TCGplayer</p>
                  <p className="num mt-0.5 text-lg font-medium">{ivl.importEstimate != null ? formatMoney(ivl.importEstimate, "THB") : "—"}</p>
                  <p className="text-xs text-ink-3">
                    {ivl.ratioE6 != null ? (
                      <>
                        market × <span className="num">{(ivl.ratioE6 / 1e6).toFixed(2)}</span> your avg landed cost
                      </>
                    ) : (
                      "Add a USD order to estimate import costs"
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-3">Local, latest seen</p>
                  <p className="num mt-0.5 text-lg font-medium">{ivl.local != null ? formatMoney(ivl.local, "THB") : "—"}</p>
                  <p className="text-xs text-ink-3">{latestLocal ? `${latestLocal.whereSeen}, ${dayKey(latestLocal.seenOn)}` : "Report one above"}</p>
                </div>
              </div>
              {ivl.cheaper && (
                <p className={cn("mt-3 border-t border-rule pt-3 text-sm font-medium", ivl.cheaper === "SAME" ? "text-ink-2" : "text-ink")}>
                  {ivl.cheaper === "SAME" ? (
                    "Same price either way."
                  ) : (
                    <>
                      {ivl.cheaper === "LOCAL" ? "Buy local" : "Import"} — cheaper by <span className="num">{formatMoney(ivl.difference!, "THB")}</span>
                    </>
                  )}
                </p>
              )}
            </div>
          </section>

          {sinceRelease && sinceRelease.some((x) => x.amount) && (
            <section className="mt-4 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4" aria-labelledby="since-h">
              <h3 id="since-h" className="eyebrow mb-3">
                Price since release · {selected.set.name}
              </h3>
              <ol className="grid grid-cols-4 gap-2 text-sm">
                {sinceRelease.map((x, i) => {
                  const prev = sinceRelease.slice(0, i).reverse().find((p) => p.amount)?.amount;
                  const cur = x.amount ? conv(x.amount.a, x.amount.c) : null;
                  const prevD = prev ? conv(prev.a, prev.c) : null;
                  return (
                    <li key={x.label}>
                      <p className="text-xs text-ink-3">{x.label}</p>
                      <p className="num font-medium">{cur != null ? formatMoney(cur, display) : "—"}</p>
                      {cur != null && prevD ? <Delta amount={null} pct={((cur - prevD) / prevD) * 100} className="text-xs" /> : null}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          <section id="watch" className="mt-4 scroll-mt-6 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4" aria-labelledby="watch-h">
            <h3 id="watch-h" className="eyebrow mb-3">
              {watch ? "Watching this printing" : "Watch this printing"}
            </h3>
            <WatchForm
              variantId={selected.id}
              existing={watch}
              defaultCurrency={display}
              deck={watchDeck}
              showPreorder={selected.set.status === "PREVIEW" || !!(release && Date.parse(release) > Date.now() - 60 * 86_400_000) || watch?.preorderPrice != null}
            />
          </section>

          {/* ── Your copies ── */}
          <section className="mt-8" aria-labelledby="mine-h">
            <h2 id="mine-h" className="mb-3 text-lg font-semibold">
              Your copies
            </h2>
            {lots.length === 0 ? (
              <p className="rounded-[var(--radius-panel)] border border-dashed border-rule-strong px-4 py-5 text-center text-sm text-ink-3">
                You don&apos;t own this card yet.{" "}
                <Link href={`/collection/add?variant=${selected.id}`} className="text-quill hover:underline">
                  Add a purchase
                </Link>
              </p>
            ) : (
              <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-sheet" data-testid="your-copies">
                {lots.map((l) => {
                  const lv = variants.find((x) => x.id === l.variantId)!;
                  const q = quoteFor(l.variantId);
                  const cost = remainingCost(l);
                  const costD = conv(cost, l.currency);
                  const value = q && canConvert ? Math.round(conv(q.amount, q.currency)! * l.remainingQuantity * conditionFactor(l.condition, settings.conditionMultipliers)) : null;
                  const pl = value != null && costD != null ? value - costD : null;
                  return (
                    <li key={l.id} className="border-b border-rule-soft px-4 py-3 last:border-b-0">
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                        <div className="min-w-0">
                          <p className="text-sm">
                            <span className="num font-medium">{l.remainingQuantity}×</span> {ART_LABEL[lv.art as VariantArt]} · {lv.finish === "FOIL" ? "Foil" : "Normal"} · {l.condition}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-3">
                            Bought <span className="num">{dayKey(l.acquiredOn)}</span>
                            {l.order && (
                              <>
                                {" "}
                                from{" "}
                                <Link href={`/collection/orders/${l.order.id}`} className="hover:text-quill hover:underline">
                                  {l.order.seller}
                                </Link>
                              </>
                            )}{" "}
                            · landed <span className="num">{formatMoney(Math.floor(l.landedTotal / l.quantity), l.currency)}</span> each
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <MoveLotSelect lotId={l.id} current={l.storageLocationId} locations={locations} />
                            <RemoveCopies lotId={l.id} remaining={l.remainingQuantity} label={`${ART_LABEL[lv.art as VariantArt]} ${lv.finish === "FOIL" ? "foil" : "normal"} ${l.condition}`} />
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <p className="num font-medium">{value != null ? formatMoney(value, display) : "—"}</p>
                          <Delta amount={pl} currency={display} pct={pl != null && costD ? (pl / costD) * 100 : null} className="text-xs" />
                          {q && <p className="text-[11px] text-ink-3">{SOURCE_LABEL[q.source]}</p>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Printings ── */}
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
                const ts = latestTcgByVariant.get(p.id);
                const held = heldByVariant.get(p.id);
                return (
                  <li key={p.id} className="border-b border-rule-soft last:border-b-0">
                    <div className={cn("flex items-center gap-3 px-3 py-2.5 sm:px-4", isSel && "bg-quill-tint/60")}>
                      <Link href={`/cards/${card.id}?v=${p.id}`} scroll={false} aria-current={isSel ? "true" : undefined} className="flex min-w-0 flex-1 items-center gap-3">
                        <span className={cn("w-10 shrink-0", landscape && "w-14")}>
                          <CardArt src={p.imageUrl} alt="" landscape={landscape} className="rounded-[4px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate text-sm", isSel ? "font-medium text-quill" : "text-ink")}>
                            {ART_LABEL[p.art as VariantArt] ?? p.art} · {p.finish === "FOIL" ? "Foil" : "Normal"}
                            <span className="text-ink-3"> · {p.set.name}</span>
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                            <Ticker setCode={p.set.code} number={p.collectorNumber} />
                            {p.rarity && <span>{p.rarity}</span>}
                            <span className="num">{p.language}</span>
                            {held && (
                              <span className="num rounded-[3px] bg-quill-tint px-1.5 text-quill">
                                own {held}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="num shrink-0 text-right text-sm">
                          {ts ? (
                            <>
                              {formatMoney(ts.market ?? ts.mid ?? ts.low ?? 0, ts.currency)}
                              <span className="block text-[11px] text-ink-3">TCGplayer · {ts.day.slice(5)}</span>
                            </>
                          ) : (
                            <span className="text-xs text-ink-3">—</span>
                          )}
                        </span>
                      </Link>
                      {p.tcgplayerId && (
                        <a
                          href={`https://www.tcgplayer.com/product/${p.tcgplayerId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hidden shrink-0 rounded-[var(--radius-control)] p-1.5 text-ink-3 hover:bg-hover hover:text-ink sm:inline-flex"
                          aria-label={`Open ${p.printName} on TCGplayer`}
                        >
                          <ExternalLink size={14} aria-hidden />
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

function SourceRow({ label, children, testid }: { label: string; children: React.ReactNode; testid?: string }) {
  return (
    <li className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-rule-soft px-4 py-3 last:border-b-0 sm:grid-cols-[160px_minmax(0,1fr)]" data-testid={testid}>
      <span className="text-sm text-ink-2">{label}</span>
      <div className="min-w-0 space-y-0.5">{children}</div>
    </li>
  );
}

function PriceValue({ amount, currency, display, conv }: { amount: number; currency: string; display: string; conv: (a: number, c: string) => number | null }) {
  const d = currency === display ? null : conv(amount, currency);
  return (
    <p className="num text-[15px] font-medium">
      {formatMoney(amount, currency)}
      {d != null && <span className="ml-2 text-sm font-normal text-ink-3">≈ {formatMoney(d, display)}</span>}
    </p>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-3">{children}</p>;
}

function PriceHeadline({
  snaps,
  manual,
  conv,
  display,
}: {
  snaps: { day: string; market: number | null; mid: number | null; low: number | null; currency: string; capturedAt: Date }[];
  manual: { price: number; currency: string; updatedAt: Date } | null;
  conv: (a: number, c: string) => number | null;
  display: string;
}) {
  const priced = snaps.filter((s) => (s.market ?? s.mid ?? s.low) != null);
  const last = priced.at(-1);
  if (!last && !manual) return null;
  if (manual) {
    const d = conv(manual.price, manual.currency);
    return (
      <div className="mt-4">
        <p className="num text-[32px] leading-none font-medium tracking-[-0.02em]">{d != null ? formatMoney(d, display) : formatMoney(manual.price, manual.currency)}</p>
        <SourceStamp source="MANUAL" asOf={manual.updatedAt} className="mt-1 block" />
      </div>
    );
  }
  const cur = last!.market ?? last!.mid ?? last!.low!;
  const prev = priced.at(-2);
  const prevAmt = prev ? (prev.market ?? prev.mid ?? prev.low!) : null;
  const dNow = conv(cur, last!.currency);
  const change = prevAmt != null ? cur - prevAmt : null;
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="num text-[32px] leading-none font-medium tracking-[-0.02em]">{dNow != null ? formatMoney(dNow, display) : formatMoney(cur, last!.currency)}</p>
        {change != null && <Delta amount={conv(change, last!.currency)} currency={display} pct={prevAmt ? (change / prevAmt) * 100 : null} className="text-sm" />}
      </div>
      <SourceStamp source="TCGPLAYER" asOf={last!.capturedAt} className="mt-1 block" />
    </div>
  );
}

function banState(rulings: { type: string; effectiveOn: Date }[]): "BAN" | "UNBAN" | null {
  const today = dayKey(); // calendar days, not instants
  const last = rulings.filter((r) => (r.type === "BAN" || r.type === "UNBAN") && dayKey(r.effectiveOn) <= today).sort((a, b) => b.effectiveOn.getTime() - a.effectiveOn.getTime())[0];
  return (last?.type as "BAN" | "UNBAN") ?? null;
}
