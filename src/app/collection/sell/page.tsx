import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { dayKey } from "@/config/app";
import { ART_LABEL, type VariantArt } from "@/lib/domain/enums";
import { fifoOrder } from "@/lib/money/fifo";
import { PageHeader } from "@/components/ui/PageHeader";
import { CardArt, Ticker } from "@/components/cards/bits";
import { SaleForm } from "./SaleForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Record sale" };

export default async function SellPage({ searchParams }: { searchParams: Promise<{ variant?: string }> }) {
  const { variant } = await searchParams;
  if (!variant) notFound();
  const userId = await getCurrentUserId();
  const v = await db.cardVariant.findUnique({ where: { id: variant }, include: { card: true, set: true } });
  if (!v) notFound();
  const lots = fifoOrder(await db.lot.findMany({ where: { userId, variantId: variant, remainingQuantity: { gt: 0 } } }));
  const latest = await db.priceSnapshot.findFirst({ where: { variantId: variant, source: "TCGPLAYER" }, orderBy: { day: "desc" } });

  return (
    <div className="mx-auto max-w-[720px] px-4 py-6 md:px-8 md:py-8">
      <Link href={`/cards/${v.cardId}?v=${v.id}`} className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> {v.card.name}
      </Link>
      <PageHeader title="Record sale" description="Sold copies come out of your oldest purchases first (FIFO)." />
      <div className="mb-6 flex items-center gap-3">
        <span className="w-12 shrink-0">
          <CardArt src={v.imageUrl} alt="" landscape={v.card.orientation === "landscape"} className="rounded-[4px]" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{v.card.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
            <Ticker setCode={v.set.code} number={v.collectorNumber} /> {ART_LABEL[v.art as VariantArt]} · {v.finish === "FOIL" ? "Foil" : "Normal"}
          </p>
        </div>
      </div>
      {lots.length === 0 ? (
        <p className="rounded-[var(--radius-panel)] border border-dashed border-rule-strong px-4 py-6 text-center text-sm text-ink-3">
          You don&apos;t own any copies of this printing to sell.
        </p>
      ) : (
        <SaleForm
          variantId={v.id}
          today={dayKey()}
          lots={lots.map((l) => ({
            id: l.id,
            quantity: l.quantity,
            remainingQuantity: l.remainingQuantity,
            landedTotal: l.landedTotal,
            currency: l.currency,
            acquiredOn: l.acquiredOn.toISOString(),
            acquiredDay: dayKey(l.acquiredOn),
          }))}
          defaultCurrency={lots[0].currency}
          marketHint={latest?.market ?? null}
        />
      )}
    </div>
  );
}
