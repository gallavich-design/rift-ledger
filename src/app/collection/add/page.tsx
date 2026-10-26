import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { getSettings } from "@/lib/portfolio/data";
import { dayKey } from "@/config/app";
import { ART_LABEL, isCurrencyCode, type VariantArt } from "@/lib/domain/enums";
import { PageHeader } from "@/components/ui/PageHeader";
import type { PickedVariant } from "@/components/cards/VariantPicker";
import { OrderForm } from "./OrderForm";

export const metadata = { title: "Add purchase" };
export const dynamic = "force-dynamic";

export default async function AddPage({ searchParams }: { searchParams: Promise<{ variant?: string }> }) {
  const { variant } = await searchParams;
  const userId = await getCurrentUserId();
  const [locations, settings, v] = await Promise.all([
    db.storageLocation.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSettings(db, userId),
    variant
      ? db.cardVariant.findUnique({
          where: { id: variant },
          include: {
            card: { select: { name: true, domains: true } },
            set: { select: { code: true, name: true } },
            priceSnapshots: { where: { source: "TCGPLAYER" }, orderBy: { day: "desc" }, take: 1 },
          },
        })
      : null,
  ]);
  const initial: PickedVariant | null = v
    ? {
        id: v.id,
        cardId: v.cardId,
        name: v.card.name,
        domains: v.card.domains,
        setCode: v.set.code,
        setName: v.set.name,
        collectorNumber: v.collectorNumber,
        art: ART_LABEL[v.art as VariantArt] ?? v.art,
        finish: v.finish,
        language: v.language,
        graded: v.gradingCompany ? `${v.gradingCompany} ${v.grade ?? ""}`.trim() : null,
        rarity: v.rarity,
        imageUrl: v.imageUrl,
        tcgMarket: v.priceSnapshots[0]?.market ?? null,
        tcgDay: v.priceSnapshots[0]?.day ?? null,
      }
    : null;

  return (
    <div className="mx-auto max-w-[880px] px-4 py-6 md:px-8 md:py-8">
      <Link href="/collection" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> Collection
      </Link>
      <PageHeader title="Add purchase" description="One card or a whole order — extra costs are spread across the cards automatically." />
      <OrderForm
        locations={locations}
        today={dayKey()}
        defaultCurrency={isCurrencyCode(settings.displayCurrency) ? settings.displayCurrency : "THB"}
        initialVariant={initial}
      />
    </div>
  );
}
