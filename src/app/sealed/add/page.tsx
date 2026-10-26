import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { getSettings } from "@/lib/portfolio/data";
import { dayKey } from "@/config/app";
import { isCurrencyCode } from "@/lib/domain/enums";
import { PageHeader } from "@/components/ui/PageHeader";
import { SealedForm } from "./SealedForm";

export const metadata = { title: "Add sealed product" };
export const dynamic = "force-dynamic";

export default async function AddSealedPage() {
  const userId = await getCurrentUserId();
  const [locations, settings, products, latest] = await Promise.all([
    db.storageLocation.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSettings(db, userId),
    db.tcgProduct.findMany({ where: { isSingle: false }, orderBy: [{ releasedOn: "desc" }, { name: "asc" }], select: { productId: true, name: true, groupName: true } }),
    db.sealedPriceSnapshot.findMany({ where: { source: "TCGPLAYER" }, orderBy: { day: "desc" }, distinct: ["tcgplayerId"] }),
  ]);
  const priceBy = new Map(latest.map((s) => [s.tcgplayerId, s]));
  return (
    <div className="mx-auto max-w-[880px] px-4 py-6 md:px-8 md:py-8">
      <Link href="/sealed" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> Sealed
      </Link>
      <PageHeader title="Add sealed product" description="Booster boxes, packs, cases and bundles you're keeping sealed or plan to open." />
      <SealedForm
        today={dayKey()}
        locations={locations}
        defaultCurrency={isCurrencyCode(settings.displayCurrency) ? settings.displayCurrency : "THB"}
        products={products.map((p) => {
          const s = priceBy.get(p.productId);
          const market = s ? (s.market ?? s.mid ?? s.low) : null;
          return { id: p.productId, name: p.name, group: p.groupName ?? "Other", market, day: s?.day ?? null };
        })}
      />
    </div>
  );
}
