import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { NewDeckForm } from "./NewDeckForm";

export const metadata = { title: "New deck" };

export default function NewDeckPage() {
  return (
    <div className="mx-auto max-w-[760px] px-4 py-6 md:px-8 md:py-8">
      <Link href="/decks" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> Decks
      </Link>
      <PageHeader title="New deck" />
      <NewDeckForm />
    </div>
  );
}
