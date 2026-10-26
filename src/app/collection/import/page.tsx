import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { getSettings } from "@/lib/portfolio/data";
import { dayKey } from "@/config/app";
import { isCurrencyCode } from "@/lib/domain/enums";
import { PageHeader } from "@/components/ui/PageHeader";
import { ImportForm } from "./ImportForm";

export const metadata = { title: "Import cards" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const settings = await getSettings(db, await getCurrentUserId());
  return (
    <div className="mx-auto max-w-[1080px] px-4 py-6 md:px-8 md:py-8">
      <Link href="/collection" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> Collection
      </Link>
      <PageHeader title="Import cards" description="Bring in a collection you already track elsewhere: paste a list, or upload a CSV from a spreadsheet." />
      <ImportForm today={dayKey()} defaultCurrency={isCurrencyCode(settings.displayCurrency) ? settings.displayCurrency : "THB"} />
    </div>
  );
}
