import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { getFx, getSettings, missingRates } from "@/lib/portfolio/data";
import { computeSealedPositions, loadSealed, loadSealedPrices } from "@/lib/sealed/value";
import { SEALED_KIND_LABEL, type SealedKind } from "@/lib/domain/enums";
import { convert, formatMoney } from "@/lib/money/money";
import { packResult } from "@/lib/sealed/pack";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Delta, MoneyText, SourceStamp } from "@/components/money/Money";
import { FxMissing } from "@/components/money/FxMissing";

export const metadata = { title: "Sealed" };
export const dynamic = "force-dynamic";

export default async function SealedPage() {
  const userId = await getCurrentUserId();
  const settings = await getSettings(db, userId);
  const display = settings.displayCurrency;
  const [fx, rows, openings] = await Promise.all([
    getFx(db, settings.fxOverrides),
    loadSealed(db, userId),
    db.packOpening.findMany({ where: { userId }, include: { sealedProduct: { select: { name: true } }, _count: { select: { lots: true } }, lots: { select: { quantity: true } } }, orderBy: { openedOn: "desc" }, take: 20 }),
  ]);
  const series = await loadSealedPrices(db, rows);
  const actions = (
    <Button asChild>
      <Link href="/sealed/add">
        <Plus size={15} aria-hidden /> Add sealed
      </Link>
    </Button>
  );
  if (!rows.length) {
    return (
      <Wrap actions={actions}>
        <EmptyState title="No sealed product yet" body="Add a booster box or pack you bought. Open it later to turn every pull into a card with its share of the box's cost." action={{ href: "/sealed/add", label: "Add sealed product" }} />
      </Wrap>
    );
  }
  if (missingRates(fx.table, [display, ...rows.map((r) => r.currency), ...openings.map((o) => o.currency)]).length) {
    return (
      <Wrap actions={actions}>
        <FxMissing />
      </Wrap>
    );
  }
  const positions = computeSealedPositions(rows, series, fx.table, display);
  const value = positions.reduce((a, p) => a + (p.value ?? 0), 0);
  const cost = positions.reduce((a, p) => a + p.cost, 0);
  const pricedCost = positions.filter((p) => p.value != null).reduce((a, p) => a + p.cost, 0);
  const opened = openings.reduce((a, o) => ({ cost: a.cost + convert(o.costBasis, o.currency, display, fx.table), pulls: a.pulls + convert(o.pullsValue, o.currency, display, fx.table) }), { cost: 0, pulls: 0 });

  return (
    <Wrap actions={actions}>
      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-rule sm:grid-cols-4">
        <Stat label="Sealed value">
          <span data-testid="sealed-value">
            <MoneyText amount={value} currency={display} />
          </span>
        </Stat>
        <Stat label="Cost basis">
          <MoneyText amount={cost} currency={display} />
        </Stat>
        <Stat label="Unrealized">
          <Delta amount={value - pricedCost} currency={display} pct={pricedCost ? ((value - pricedCost) / pricedCost) * 100 : null} />
        </Stat>
        <Stat label="Openings" hint="pulls vs cost">
          {openings.length ? <Delta amount={opened.pulls - opened.cost} currency={display} /> : <span className="num text-ink-3">—</span>}
        </Stat>
      </dl>

      <section aria-labelledby="held-h">
        <h2 id="held-h" className="mb-3 text-base font-semibold">
          Still sealed
        </h2>
        {positions.length === 0 ? (
          <p className="rounded-[var(--radius-panel)] border border-rule bg-sheet px-4 py-6 text-center text-sm text-ink-3">Everything&rsquo;s been opened.</p>
        ) : (
          <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-sheet" data-testid="sealed-list">
            {positions.map((p) => (
              <li key={p.id} className="border-b border-rule-soft last:border-b-0">
                <Link href={`/sealed/${p.id}`} className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-hover">
                  <span className="grid size-12 place-items-center overflow-hidden rounded-[var(--radius-control)] border border-rule-soft bg-inset">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.imageUrl ? <img src={p.imageUrl} alt="" className="size-full object-contain" loading="lazy" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="mt-0.5 block text-xs text-ink-3">
                      {SEALED_KIND_LABEL[p.kind as SealedKind] ?? p.kind} · <span className="num">×{p.remaining}</span> · cost <span className="num">{formatMoney(p.cost, display)}</span>
                    </span>
                    {p.quote ? <SourceStamp source={p.quote.source} asOf={p.quote.asOf} className="block" /> : <span className="block text-xs text-caution">No price — set one manually</span>}
                  </span>
                  <span className="text-right text-sm">
                    <MoneyText amount={p.value} currency={display} className="block font-medium" />
                    <Delta amount={null} pct={p.plPct} className="text-xs" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {openings.length > 0 && (
        <section aria-labelledby="open-h" className="mt-8">
          <h2 id="open-h" className="mb-3 text-base font-semibold">
            Recent openings
          </h2>
          <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-sheet">
            {openings.map((o) => {
              const r = packResult(o.costBasis, o.pullsValue);
              return (
                <li key={o.id} className="border-b border-rule-soft last:border-b-0">
                  <Link href={`/sealed/openings/${o.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-hover">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{o.sealedProduct.name}</span>
                      <span className="num text-xs text-ink-3">
                        {o.openedOn.toISOString().slice(0, 10)} · {o.lots.reduce((a, l) => a + l.quantity, 0)} cards · paid {formatMoney(o.costBasis, o.currency)}
                      </span>
                    </span>
                    <Delta amount={r.change} currency={o.currency} pct={r.pct} className="text-sm" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </Wrap>
  );
}

function Wrap({ children, actions }: { children: React.ReactNode; actions: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader title="Sealed" description="Boxes and packs you hold, priced daily from TCGplayer. Open one to log the pulls." actions={actions} />
      {children}
    </div>
  );
}

function Stat({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-sheet px-4 py-3">
      <dt className="eyebrow flex items-baseline justify-between gap-2">
        {label}
        {hint && <span className="normal-case tracking-normal text-ink-3">{hint}</span>}
      </dt>
      <dd className="mt-1.5 text-[17px] font-medium">{children}</dd>
    </div>
  );
}
