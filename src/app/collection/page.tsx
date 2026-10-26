import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { getPriceBook, getSettings, getFx, loadLotsAndSales, loadVariantInfo } from "@/lib/portfolio/data";
import { computePositions, computeTotals } from "@/lib/portfolio/compute";
import { ART_LABEL, SOURCE_LABEL, type VariantArt } from "@/lib/domain/enums";
import { formatMoney } from "@/lib/money/money";
import { CardArt, Ticker } from "@/components/cards/bits";
import { DomainStripe } from "@/components/cards/DomainStripe";
import { Delta, MoneyText, SourceStamp } from "@/components/money/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { FxMissing } from "@/components/money/FxMissing";
import { cn } from "@/lib/ui";
import { CollectionTabs } from "./CollectionTabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Collection" };

type SP = { location?: string; set?: string; sort?: string };

export default async function CollectionPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const userId = await getCurrentUserId();
  const settings = await getSettings(db, userId);
  const display = settings.displayCurrency;
  const source = settings.defaultValuationSource;
  const fx = await getFx(db, settings.fxOverrides);
  const { lots, lotInputs, saleInputs } = await loadLotsAndSales(db, userId);
  const locations = await db.storageLocation.findMany({ where: { userId }, orderBy: { name: "asc" } });
  const locName = new Map(locations.map((l) => [l.id, l.name]));

  const openLots = lots.filter((l) => l.remainingQuantity > 0);
  const filteredIds = new Set(
    openLots
      .filter((l) => (sp.location ? (sp.location === "none" ? !l.storageLocationId : l.storageLocationId === sp.location) : true))
      .map((l) => l.id),
  );
  const variantIds = [...new Set(openLots.map((l) => l.variantId))];
  const [info, prices] = await Promise.all([loadVariantInfo(db, variantIds), getPriceBook(db, userId, variantIds, source)]);
  const setCodes = [...new Set([...info.values()].map((v) => v.setCode))].sort();
  const metaRows = await db.metaDeckCard.findMany({ where: { metaDeck: { userId }, cardId: { in: [...new Set([...info.values()].map((v) => v.cardId))] } }, select: { cardId: true, metaDeckId: true } });
  const metaCount = new Map<string, Set<string>>();
  for (const m of metaRows) metaCount.set(m.cardId, (metaCount.get(m.cardId) ?? new Set()).add(m.metaDeckId));

  if (fx.missing.includes(display) || (display !== "USD" && fx.missing.length && lots.some((l) => l.currency !== display))) {
    return (
      <Shell>
        <FxMissing />
      </Shell>
    );
  }

  let positions = computePositions(
    lotInputs.filter((l) => filteredIds.has(l.id)),
    prices,
    fx.table,
    display,
    settings.conditionMultipliers,
  );
  if (sp.set) positions = positions.filter((p) => info.get(p.variantId)?.setCode === sp.set);
  const sort = sp.sort ?? "value";
  positions.sort((a, b) =>
    sort === "name"
      ? (info.get(a.variantId)?.name ?? "").localeCompare(info.get(b.variantId)?.name ?? "")
      : sort === "pl"
        ? (b.plPct ?? -Infinity) - (a.plPct ?? -Infinity)
        : (b.value ?? -1) - (a.value ?? -1),
  );
  const totals = computeTotals(positions, sp.location || sp.set ? [] : saleInputs, fx.table, display);
  const lotsByVariant = new Map<string, typeof openLots>();
  for (const l of openLots) if (filteredIds.has(l.id)) lotsByVariant.set(l.variantId, [...(lotsByVariant.get(l.variantId) ?? []), l]);

  const href = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/collection?${s}` : "/collection";
  };

  return (
    <Shell>
      <CollectionTabs active="positions" />
      {lots.length === 0 ? (
        <EmptyState title="Your collection is empty" body="Add your first order — or import a list or spreadsheet of cards you already have." action={{ href: "/collection/import", label: "Import cards" }} />
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span>
              <span className="num font-medium">{totals.copies}</span> <span className="text-ink-3">copies of</span>{" "}
              <span className="num font-medium">{totals.positions}</span> <span className="text-ink-3">printings</span>
            </span>
            <span>
              <span className="text-ink-3">Value </span>
              <MoneyText amount={totals.value} currency={display} className="font-medium" />
            </span>
            <span>
              <span className="text-ink-3">Cost </span>
              <MoneyText amount={totals.cost} currency={display} />
            </span>
            <Delta amount={totals.unrealized} currency={display} pct={totals.unrealizedPct} />
            <span className="text-xs text-ink-3">Valued at {SOURCE_LABEL[source]} · change in Settings</span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Filter label="Stored in" current={sp.location} options={[["", "Anywhere"], ...locations.map((l) => [l.id, l.name] as [string, string]), ["none", "Unassigned"]]} href={(v) => href({ location: v || undefined })} />
            <Filter label="Set" current={sp.set} options={[["", "All sets"], ...setCodes.map((c) => [c, c] as [string, string])]} href={(v) => href({ set: v || undefined })} />
            <Filter label="Sort" current={sort} options={[["value", "Value"], ["pl", "Gain %"], ["name", "Name"]]} href={(v) => href({ sort: v === "value" ? undefined : v })} />
          </div>

          {positions.length === 0 ? (
            <EmptyState title="Nothing here" body="No cards match these filters." action={{ href: "/collection", label: "Clear filters" }} />
          ) : (
            <ul className="mt-4 overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-sheet" aria-label="Cards you own">
              <li className="eyebrow hidden grid-cols-[minmax(0,1fr)_56px_110px_130px_150px] gap-3 border-b border-rule px-4 py-2 md:grid" aria-hidden>
                <span>Card</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Cost</span>
                <span className="text-right">Value</span>
                <span className="text-right">Gain / loss</span>
              </li>
              {positions.map((p) => {
                const v = info.get(p.variantId)!;
                const pl = lotsByVariant.get(p.variantId) ?? [];
                const where = [...new Set(pl.map((l) => (l.storageLocationId ? locName.get(l.storageLocationId) : "Unassigned")))];
                return (
                  <li key={p.variantId} className="border-b border-rule-soft last:border-b-0" data-testid="position">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,1fr)_56px_110px_130px_150px] md:items-center">
                      <Link href={`/cards/${v.cardId}?v=${v.id}`} className="col-span-2 flex min-w-0 items-center gap-3 hover:text-quill md:col-span-1">
                        <span className="relative w-10 shrink-0">
                          <CardArt src={v.imageUrl} alt="" landscape={v.orientation === "landscape"} className="rounded-[4px]" />
                          <DomainStripe domains={v.domains} className="absolute inset-x-1 top-0 h-[2px]" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-medium">{v.name}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-3">
                            <Ticker setCode={v.setCode} number={v.collectorNumber} />
                            {ART_LABEL[v.art as VariantArt]} · {v.finish === "FOIL" ? "Foil" : "Normal"}
                            {v.graded && <> · {v.graded}</>}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-ink-3">
                            {where.join(", ")}
                            {metaCount.get(v.cardId)?.size ? (
                              <span className="text-quill">
                                {" "}
                                · in {metaCount.get(v.cardId)!.size} meta {metaCount.get(v.cardId)!.size === 1 ? "deck" : "decks"}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </Link>
                      <span className="num text-sm text-ink-3 md:text-right md:text-ink">
                        <span className="md:hidden">Qty </span>
                        {p.quantity}
                      </span>
                      <span className="num text-right text-sm text-ink-2 md:order-none">
                        <span className="text-ink-3 md:hidden">Cost </span>
                        {formatMoney(p.cost, display)}
                      </span>
                      <span className="col-span-1 text-sm md:text-right">
                        <MoneyText amount={p.value} currency={display} className="font-medium" />
                        {p.quote ? (
                          <SourceStamp source={p.quote.source} asOf={p.quote.asOf} className="block truncate text-[11px]" />
                        ) : (
                          <Link href={`/cards/${v.cardId}?v=${v.id}#prices`} className="block text-[11px] text-quill hover:underline">
                            Set a price
                          </Link>
                        )}
                      </span>
                      <span className="text-right text-sm">
                        <Delta amount={p.pl} currency={display} pct={p.plPct} className="flex-wrap justify-end" />
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {totals.unpricedPositions > 0 && (
            <p className="mt-2 text-xs text-ink-3">
              <span className="num">{totals.unpricedPositions}</span> {totals.unpricedPositions === 1 ? "printing has" : "printings have"} no {SOURCE_LABEL[source]} price — they count toward cost but not value.
            </p>
          )}
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1080px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Collection"
        actions={
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link href="/collection/import">Import</Link>
            </Button>
            <Button asChild>
              <Link href="/collection/add">Add purchase</Link>
            </Button>
          </div>
        }
      />
      {children}
    </div>
  );
}

function Filter({ label, current, options, href }: { label: string; current?: string; options: [string, string][]; href: (v: string) => string }) {
  const cur = current ?? options[0][0];
  return (
    <details className="group relative">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-full border border-rule bg-sheet px-3 text-[13px] hover:border-rule-strong [&::-webkit-details-marker]:hidden">
        <span className="text-ink-3">{label}:</span>
        <span className="max-w-40 truncate font-medium">{options.find((o) => o[0] === cur)?.[1] ?? options[0][1]}</span>
        <span aria-hidden className="text-ink-3">▾</span>
      </summary>
      <ul className="absolute left-0 z-20 mt-1 max-h-72 min-w-48 overflow-y-auto rounded-[var(--radius-control)] border border-rule-strong bg-sheet py-1 shadow-[0_12px_32px_-12px_rgba(22,24,29,0.25)]">
        {options.map(([v, l]) => (
          <li key={v}>
            <Link href={href(v)} className={cn("block px-3 py-1.5 text-sm hover:bg-hover", v === cur && "font-medium text-quill")}>
              {l}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
