import Link from "next/link";
import { Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { dayKey } from "@/config/app";

const NEW_FOR_DAYS = 28;

/** Spec §4.4: a "new set" banner for 4 weeks after each release, and a note for sets in preview. */
export async function NewSetBanner() {
  const now = new Date();
  const since = new Date(now.getTime() - NEW_FOR_DAYS * 86_400_000);
  const [fresh, preview] = await Promise.all([
    db.set.findMany({ where: { releaseDate: { gte: since, lte: now } }, orderBy: { releaseDate: "desc" } }),
    db.set.findMany({ where: { status: "PREVIEW" }, orderBy: { releaseDate: "asc" } }),
  ]);
  if (!fresh.length && !preview.length) return null;
  const today = dayKey();
  return (
    <div className="mb-6 space-y-2" data-testid="new-set-banner">
      {fresh.map((s) => {
        const days = Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dayKey(s.releaseDate!)}T00:00:00Z`)) / 86_400_000));
        return (
          <p key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-panel)] border border-quill/25 bg-quill-tint px-4 py-2.5 text-sm text-quill">
            <Sparkles size={15} aria-hidden />
            <span>
              <strong className="font-semibold">New set: {s.name}</strong> — released {days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}. Prices are still settling.
            </span>
            <Link href={`/cards?set=${s.code}`} className="font-medium underline underline-offset-2">
              Browse
            </Link>
          </p>
        );
      })}
      {preview.map((s) => (
        <p key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-panel)] border border-rule bg-sheet px-4 py-2.5 text-sm text-ink-2">
          <Sparkles size={15} aria-hidden className="text-quill" />
          <span>
            <strong className="font-semibold text-ink">{s.name}</strong> is in preview{s.releaseDate ? `, out ${dayKey(s.releaseDate)}` : ""}. Watch revealed cards to log pre-order prices.
          </span>
          <Link href={`/cards?set=${s.code}`} className="font-medium text-quill underline underline-offset-2">
            See reveals
          </Link>
        </p>
      ))}
    </div>
  );
}
