import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { PageHeader } from "@/components/ui/PageHeader";
import { STORAGE_TYPE_LABEL, type StorageType } from "@/lib/domain/enums";
import { LocationForm } from "./LocationForm";
import { LocationRow } from "./LocationRow";
import { SyncButton } from "./SyncButton";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

function fmt(d: Date) {
  return d.toLocaleString("en-GB", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }) + " ICT";
}

export default async function SettingsPage() {
  const userId = await getCurrentUserId();
  const [locations, lastSync, counts, sets] = await Promise.all([
    db.storageLocation.findMany({ where: { userId }, orderBy: { name: "asc" }, include: { _count: { select: { lots: true } } } }),
    db.syncRun.findFirst({ where: { kind: "CARDS", ok: true }, orderBy: { startedAt: "desc" } }),
    Promise.all([db.card.count(), db.cardVariant.count()]),
    db.set.findMany({ orderBy: [{ releaseDate: "asc" }] }),
  ]);
  const [cardCount, variantCount] = counts;

  return (
    <div className="mx-auto max-w-[880px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader title="Settings" />

      <Section
        id="locations"
        title="Storage locations"
        description="Where your physical cards live — binders, deck boxes, bulk boxes. Every card you add can point at one."
      >
        {locations.length === 0 ? (
          <p className="rounded-[var(--radius-panel)] border border-dashed border-rule-strong px-4 py-6 text-center text-sm text-ink-3">
            No locations yet. Add your first binder or deck box below.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-sheet">
            {locations.map((l) => (
              <LocationRow
                key={l.id}
                location={{ id: l.id, name: l.name, type: l.type as StorageType, notes: l.notes, lots: l._count.lots }}
                typeLabel={STORAGE_TYPE_LABEL[l.type as StorageType] ?? l.type}
              />
            ))}
          </ul>
        )}
        <div className="mt-4 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4">
          <h3 className="mb-3 text-sm font-medium">Add a location</h3>
          <LocationForm mode="create" />
        </div>
      </Section>

      <Section
        id="catalog"
        title="Card catalogue"
        description="Card data comes from Riftcodex and is stored locally, so browsing never waits on the network. Run daily via cron (see README)."
      >
        <div className="rounded-[var(--radius-panel)] border border-rule bg-sheet">
          <dl className="grid grid-cols-3 divide-x divide-rule border-b border-rule">
            <Stat label="Sets" value={sets.length} />
            <Stat label="Cards" value={cardCount} />
            <Stat label="Printings" value={variantCount} />
          </dl>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-ink-2">
              {lastSync ? (
                <>
                  Last synced <span className="num">{fmt(lastSync.finishedAt ?? lastSync.startedAt)}</span>
                </>
              ) : (
                "Never synced."
              )}
            </p>
            <SyncButton />
          </div>
        </div>
        {sets.length > 0 && (
          <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {sets.map((s) => (
              <li key={s.id} className="flex min-w-0 items-baseline gap-2 border-b border-rule-soft py-1.5">
                <span className="num w-10 shrink-0 text-xs font-medium text-ink-2">{s.code}</span>
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="num shrink-0 text-xs text-ink-3">{s.releaseDate?.toISOString().slice(0, 10) ?? "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mb-10 scroll-mt-16">
      <h2 id={`${id}-h`} className="text-lg font-semibold">
        {title}
      </h2>
      <p className="mt-1 mb-4 max-w-prose text-sm text-ink-3">{description}</p>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-3">
      <dt className="eyebrow">{label}</dt>
      <dd className="num mt-1 text-xl font-medium">{value.toLocaleString("en-US")}</dd>
    </div>
  );
}
