import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { dayKey } from "@/config/app";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetaImportForm } from "../MetaControls";

export const metadata = { title: "Import a meta list" };

export default function MetaImportPage() {
  return (
    <div className="mx-auto max-w-[760px] px-4 py-6 md:px-8 md:py-8">
      <Link href="/meta" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> Meta
      </Link>
      <PageHeader title="Import a tournament list" />
      <MetaImportForm today={dayKey()} />
    </div>
  );
}
