import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { dayKey } from "@/config/app";
import { formatMoney } from "@/lib/money/money";
import { packResult, pullStats } from "@/lib/sealed/pack";
import { ART_LABEL, type VariantArt } from "@/lib/domain/enums";
import { PageHeader } from "@/components/ui/PageHeader";
import { Delta } from "@/components/money/Money";
import { Ticker } from "@/components/cards/bits";
import { UndoOpening } from "./UndoOpening";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pack opening" };

export default async function OpeningPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const userId = await getCurrentUserId();
  const o = await db.packOpening.findFirst({
    where: { id, userId },
    include: {
      sealedProduct: { select: { id: true, name: true } },
      lots: { include: { variant: { include: { card: { select: { name: true, id: true } }, set: { select: { code: true } } } }, _count: { select: { saleAllocations: true } } }, orderBy: { landedTotal: "desc" } },
    },
  });
  if (!o) notFound();
  const r = packResult(o.costBasis, o.pullsValue);
  const stats = pullStats(o.lots.map((l) => ({ quantity: l.quantity, rarity: l.variant.rarity, art: l.variant.art })));
  const ratio = o.pullsValue ? o.costBasis / o.pullsValue : null;
  return (
    <div className="mx-auto max-w-[880px] px-4 py-6 md:px-8 md:py-8">
      <Link href={`/sealed/${o.sealedProduct.id}`} className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> {o.sealedProduct.name}
      </Link>
      {saved && (
        <p role="status" className="mb-4 rounded-[var(--radius-panel)] border border-gain/30 bg-gain-tint px-4 py-2.5 text-sm text-gain">
          Opening saved — {stats.cards} cards added to your collection.
        </p>
      )}
      <PageHeader title={`Opened ${o.sealedProduct.name}`} description={<span className="num">{dayKey(o.openedOn)}</span>} />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-rule sm:grid-cols-4">
        <Stat label="You paid">{formatMoney(o.costBasis, o.currency)}</Stat>
        <Stat label="Pulls worth">
          <span data-testid="opening-value">{formatMoney(o.pullsValue, o.currency)}</span>
        </Stat>
        <Stat label="Result">
          <span data-testid="opening-result">
            <Delta amount={r.change} currency={o.currency} pct={r.pct} />
          </span>
        </Stat>
        <Stat label="Cost ratio" hint="paid ÷ worth">
          {ratio != null ? ratio.toFixed(3) : "—"}
        </Stat>
      </dl>
      <p className="mt-2 text-xs text-ink-3">Values are the market prices at the moment you saved the opening, in {o.currency}. Each pull&rsquo;s cost basis = its value × the cost ratio.</p>

      <section className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-sheet">
          <table className="w-full text-sm" data-testid="opening-lots">
            <thead className="eyebrow border-b border-rule text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">Card</th>
                <th className="px-2 py-2.5 text-right font-medium">Qty</th>
                <th className="px-4 py-2.5 text-right font-medium">Cost basis</th>
              </tr>
            </thead>
            <tbody>
              {o.lots.map((l) => (
                <tr key={l.id} className="border-b border-rule-soft last:border-b-0">
                  <td className="px-4 py-2">
                    <Link href={`/cards/${l.variant.card.id}?v=${l.variantId}`} className="font-medium hover:text-quill">
                      {l.variant.card.name}
                    </Link>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                      <Ticker setCode={l.variant.set.code} number={l.variant.collectorNumber} />
                      {l.variant.art !== "STANDARD" && <span>{ART_LABEL[l.variant.art as VariantArt] ?? l.variant.art}</span>}
                      {l.variant.finish === "FOIL" && <span>Foil</span>}
                      <span>{l.condition}</span>
                    </span>
                  </td>
                  <td className="num px-2 py-2 text-right">{l.quantity}</td>
                  <td className="num px-4 py-2 text-right">{formatMoney(l.landedTotal, l.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <aside className="space-y-4">
          <div className="rounded-[var(--radius-panel)] border border-rule bg-sheet p-4" data-testid="pull-stats">
            <h2 className="eyebrow">Pull stats</h2>
            <p className="mt-2 text-sm">
              <span className="num font-medium">{stats.cards}</span> cards · <span className="num font-medium">{stats.special}</span> special printings
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {stats.rarity.map((x) => (
                <li key={x.key} className="flex justify-between">
                  <span className="text-ink-2">{x.key}</span>
                  <span className="num">{x.count}</span>
                </li>
              ))}
            </ul>
          </div>
          {o.lots.every((l) => l._count.saleAllocations === 0) && <UndoOpening id={o.id} back={`/sealed/${o.sealedProduct.id}`} />}
        </aside>
      </section>
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
      <dd className="num mt-1.5 text-[17px] font-medium">{children}</dd>
    </div>
  );
}
