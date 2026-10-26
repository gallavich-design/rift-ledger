import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { dayKey } from "@/config/app";
import { PageHeader } from "@/components/ui/PageHeader";
import { RulingForm } from "./RulingForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add ruling" };

export default async function NewRulingPage() {
  const sets = await db.set.findMany({ where: { standardLegal: true }, orderBy: { releaseDate: "asc" }, select: { code: true, name: true } });
  return (
    <div className="mx-auto max-w-[760px] px-4 py-6 md:px-8 md:py-8">
      <Link href="/news?tab=rulings" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> News & Alerts
      </Link>
      <PageHeader title="Add ruling" description="Errata, a ban or unban, or a set rotating out of Standard. Anyone who owns or plays the cards gets an alert." />
      <RulingForm today={dayKey()} sets={sets} />
    </div>
  );
}
