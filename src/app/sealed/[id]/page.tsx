import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PackageOpen } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { getFx, getSettings, missingRates } from "@/lib/portfolio/data";
import { computeSealedPositions, loadSealed, loadSealedPrices, sealedQuote } from "@/lib/sealed/value";
import { SEALED_KIND_LABEL, SOURCE_LABEL, isCurrencyCode, type SealedKind } from "@/lib/domain/enums";
import { convert, formatMoney } from "@/lib/money/money";
import { packResult } from "@/lib/sealed/pack";
import { dayKey } from "@/config/app";
import { SOURCE_SERIES_COLOR, COST_COLOR } from "@/config/chartColors";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Delta, MoneyText, SourceStamp } from "@/components/money/Money";
import { FxMissing } from "@/components/money/FxMissing";
import { LineChart } from "@/components/charts/LineChart";
import { SealedSide } from "./SealedSide";

export const dynamic = "force-dynamic";

export default async function SealedDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const userId = await getCurrentUserId();
  const settings = await getSettings(db, userId);
  const display = settings.displayCurrency;
  const [fx, rows, product] = await Promise.all([
    getFx(db, settings.fxOverrides),
    loadSealed(db, userId),
    db.sealedProduct.findFirst({ where: { id, userId }, include: { storageLocation: true, openings: { include: { lots: { select: { quantity: true } } }, orderBy: { openedOn: "desc" } } } }),
  ]);
  if (!product) notFound();
  const row = rows.find((r) => r.id === id)!;
  const series = await loadSealedPrices(db, [row]);
  const quote = sealedQuote(row, series);
  const tcg = product.tcgplayerId ? await db.tcgProduct.findUnique({ where: { productId: product.tcgplayerId } }) : null;
  const canConvert = missingRates(fx.table, [display, product.currency, ...(series.get(product.tcgplayerId ?? "") ?? []).map((s) => s.currency)]).length === 0;
  const pos = canConvert ? computeSealedPositions([row], series, fx.table, display)[0] : undefined;

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6 md:px-8 md:py-8">
      <Link href="/sealed" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> Sealed
      </Link>
      {saved && (
        <p role="status" className="mb-4 rounded-[var(--radius-panel)] border border-gain/30 bg-gain-tint px-4 py-2.5 text-sm text-gain">
          Saved.
        </p>
      )}
      <PageHeader
        title={product.name}
        description={
          <>
            {SEALED_KIND_LABEL[product.kind as SealedKind] ?? product.kind} · bought <span className="num">{dayKey(product.acquiredOn)}</span> ·{" "}
            <span className="num">
              {product.remaining} of {product.quantity}
            </span>{" "}
            still sealed{product.storageLocation ? ` · ${product.storageLocation.name}` : ""}
          </>
        }
        actions={
          product.remaining > 0 ? (
            <Button asChild>
              <Link href={`/sealed/${id}/open`}>
                <PackageOpen size={15} aria-hidden /> Open one
              </Link>
            </Button>
          ) : undefined
        }
      />
      {!canConvert ? (
        <FxMissing />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-rule sm:grid-cols-3">
              <div className="bg-sheet px-4 py-3">
                <dt className="eyebrow">Price each</dt>
                <dd className="mt-1.5 text-[17px] font-medium">
                  {quote ? <MoneyText amount={convert(quote.amount, quote.currency, display, fx.table)} currency={display} /> : <span className="text-ink-3">—</span>}
                </dd>
                {quote && <SourceStamp source={quote.source} asOf={quote.asOf} />}
              </div>
              <div className="bg-sheet px-4 py-3">
                <dt className="eyebrow">Landed cost each</dt>
                <dd className="mt-1.5 text-[17px] font-medium">
                  <MoneyText amount={product.landedUnitCost} currency={product.currency} />
                </dd>
              </div>
              <div className="col-span-2 bg-sheet px-4 py-3 sm:col-span-1">
                <dt className="eyebrow">Unrealized</dt>
                <dd className="mt-1.5 text-[17px] font-medium">{pos ? <Delta amount={pos.pl} currency={display} pct={pos.plPct} /> : <span className="num text-ink-3">—</span>}</dd>
              </div>
            </dl>

            <section className="rounded-[var(--radius-panel)] border border-rule bg-sheet p-4 sm:p-5" aria-labelledby="ph">
              <h2 id="ph" className="mb-3 text-base font-semibold">
                Price history
              </h2>
              <LineChart
                ariaLabel={`${product.name} price history`}
                currency={display}
                today={dayKey()}
                emptyText={product.tcgplayerId ? "No TCGplayer price yet — the daily price job adds one." : "Not linked to a TCGplayer product, so there's no price history."}
                series={[
                  { id: "TCGPLAYER", name: SOURCE_LABEL.TCGPLAYER, color: SOURCE_SERIES_COLOR.TCGPLAYER, points: (series.get(product.tcgplayerId ?? "") ?? []).map((s) => ({ day: s.day, value: convert(s.amount, s.currency, display, fx.table) })) },
                  ...((series.get(product.tcgplayerId ?? "")?.length ?? 0) > 0
                    ? [{ id: "cost", name: "Landed cost", color: COST_COLOR, dashed: true, points: [{ day: dayKey(product.acquiredOn), value: convert(product.landedUnitCost, product.currency, display, fx.table) }, { day: dayKey(), value: convert(product.landedUnitCost, product.currency, display, fx.table) }] }]
                    : []),
                ].filter((s) => s.points.length > 0)}
              />
              {tcg?.url && (
                <p className="mt-2 text-xs text-ink-3">
                  <a href={tcg.url} target="_blank" rel="noreferrer" className="text-quill hover:underline">
                    View on TCGplayer
                  </a>
                </p>
              )}
            </section>

            <section aria-labelledby="oh">
              <h2 id="oh" className="mb-3 text-base font-semibold">
                Openings
              </h2>
              {product.openings.length === 0 ? (
                <p className="rounded-[var(--radius-panel)] border border-rule bg-sheet px-4 py-6 text-center text-sm text-ink-3">Not opened yet.</p>
              ) : (
                <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-sheet">
                  {product.openings.map((o) => {
                    const r = packResult(o.costBasis, o.pullsValue);
                    return (
                      <li key={o.id} className="border-b border-rule-soft last:border-b-0">
                        <Link href={`/sealed/openings/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-hover">
                          <span className="num">
                            {dayKey(o.openedOn)} · {o.lots.reduce((a, l) => a + l.quantity, 0)} cards · pulls {formatMoney(o.pullsValue, o.currency)}
                          </span>
                          <Delta amount={r.change} currency={o.currency} pct={r.pct} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
          <SealedSide
            id={id}
            manualPrice={product.manualPrice}
            manualCurrency={product.manualCurrency ?? (isCurrencyCode(display) ? display : "THB")}
            canDelete={product.openings.length === 0}
          />
        </div>
      )}
    </div>
  );
}
