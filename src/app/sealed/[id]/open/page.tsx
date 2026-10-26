import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { dayKey } from "@/config/app";
import { PageHeader } from "@/components/ui/PageHeader";
import { OpenForm } from "./OpenForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Open sealed product" };

export default async function OpenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  const [p, locations] = await Promise.all([
    db.sealedProduct.findFirst({ where: { id, userId } }),
    db.storageLocation.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!p) notFound();
  const today = dayKey();
  const bought = dayKey(p.acquiredOn);
  return (
    <div className="mx-auto max-w-[880px] px-4 py-6 md:px-8 md:py-8">
      <Link href={`/sealed/${id}`} className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> {p.name}
      </Link>
      <PageHeader title={`Open ${p.name}`} description="Add every card you pulled. Each becomes a lot whose cost basis is its share of what you paid, split by market value." />
      {p.remaining < 1 ? (
        <p className="rounded-[var(--radius-panel)] border border-rule bg-sheet px-4 py-6 text-center text-sm text-ink-3">You&rsquo;ve opened all of these.</p>
      ) : (
        <OpenForm
          sealedId={id}
          boxCost={p.landedUnitCost}
          currency={p.currency}
          today={today}
          minDay={bought > today ? today : bought}
          locations={locations}
          defaultLocation={p.storageLocationId ?? ""}
        />
      )}
    </div>
  );
}
