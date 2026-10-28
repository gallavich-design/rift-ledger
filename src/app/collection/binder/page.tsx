import Link from "next/link";
import { FramedImage } from "@/components/cards/FramedImage";
import { db } from "@/lib/db";
import { getCurrentUserId, isDemoMode } from "@/lib/currentUser";
import {
  getFx,
  getPriceBook,
  getSettings,
  missingRates,
} from "@/lib/portfolio/data";
import { valuationSource } from "@/lib/prices/quote";
import {
  completeBinder,
  loadSetSlots,
  missingToAdd,
  type ChecklistSlot,
} from "@/lib/collection/binder";
import { suggestBinder } from "@/lib/collection/binderChoice";
import { dayKey } from "@/config/app";
import { CompleteSet } from "./CompleteSet";
import { BinderEditor } from "./BinderEditor";
import { Pencil } from "lucide-react";
import { ART_LABEL, SOURCE_LABEL, type VariantArt } from "@/lib/domain/enums";
import { convert, formatMoney, formatPct } from "@/lib/money/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { FxMissing } from "@/components/money/FxMissing";
import { cn } from "@/lib/ui";
import { CollectionTabs } from "../CollectionTabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set binder" };

type SP = { set?: string; scope?: string; show?: string; edit?: string };

export default async function BinderPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const userId = await getCurrentUserId();
  const demo = await isDemoMode();
  const settings = await getSettings(db, userId);
  const display = settings.displayCurrency;
  const sets = await db.set.findMany({
    where: { cardCount: { gt: 0 } },
    orderBy: { releaseDate: "asc" },
    select: { id: true, code: true, name: true },
  });
  const owned = await db.lot.groupBy({
    by: ["variantId"],
    where: { userId, remainingQuantity: { gt: 0 } },
    _sum: { remainingQuantity: true },
  });
  const ownedByVariant = new Map(
    owned.map((o) => [o.variantId, o._sum.remainingQuantity ?? 0]),
  );

  // Default: the set you own the most cards from, else the newest main set.
  let set = sets.find((s) => s.code === sp.set);
  if (!set && owned.length) {
    const perSet = await db.cardVariant.groupBy({
      by: ["setId"],
      where: { id: { in: [...ownedByVariant.keys()] } },
      _count: true,
      orderBy: { _count: { setId: "desc" } },
      take: 1,
    });
    set = sets.find((s) => s.id === perSet[0]?.setId);
  }
  set ??=
    sets.filter((s) => !["PR", "OPP", "JDG"].includes(s.code)).at(-1) ??
    sets[0];
  const scope = sp.scope === "all" ? "all" : "base";
  const show =
    sp.show === "missing" ? "missing" : sp.show === "owned" ? "owned" : "all";
  const editing = sp.edit === "1";

  const href = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({
      set: set?.code,
      scope,
      show,
      edit: editing ? "1" : undefined,
      ...patch,
    }))
      if (
        v &&
        !(k === "scope" && v === "base") &&
        !(k === "show" && v === "all")
      )
        p.set(k, v);
    return `/collection/binder?${p}`;
  };

  if (!set) {
    return (
      <Shell>
        <p className="mt-6 text-sm text-ink-3">
          No sets in the catalogue yet — sync cards in Settings.
        </p>
      </Shell>
    );
  }

  const setSlots = await loadSetSlots(db, set.id, scope, [
    ...ownedByVariant.keys(),
  ]);
  const variants = setSlots.flatMap((s) => s.printings);

  const source = await valuationSource(db, userId, demo);
  const [fx, book] = await Promise.all([
    getFx(db, settings.fxOverrides),
    getPriceBook(
      db,
      userId,
      variants.map((v) => v.id),
      source,
    ),
  ]);
  if (
    missingRates(fx.table, [
      display,
      ...[...book.values()].map((q) => q.currency),
    ]).length
  ) {
    return (
      <Shell>
        <FxMissing />
      </Shell>
    );
  }

  // One slot per printing (card + number + art); normal and foil fill the same slot.
  const slots = new Map<
    string,
    ChecklistSlot & { art: string; landscape: boolean }
  >();
  for (const ss of setSlots) {
    let cheapest: number | null = null;
    for (const v of ss.printings) {
      const q = book.get(v.id);
      if (!q) continue;
      const amt = convert(q.amount, q.currency, display, fx.table);
      if (cheapest == null || amt < cheapest) cheapest = amt;
    }
    slots.set(ss.key, {
      number: ss.number,
      cardId: ss.cardId,
      name: ss.name,
      rarity: ss.rarity,
      imageUrl: ss.imageUrl,
      variantIds: ss.variantIds,
      cheapest,
      art: ss.art,
      landscape: ss.landscape,
    });
  }

  // What "Complete the set" would add, priced the same way the action prices it.
  const toAdd = missingToAdd(setSlots, ownedByVariant);
  let addTotal = 0;
  let addUnpriced = 0;
  for (const t of toAdd) {
    const q = book.get(t.variantId);
    if (q) addTotal += convert(q.amount, q.currency, display, fx.table);
    else addUnpriced++;
  }
  const locations = await db.storageLocation.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true },
  });

  const binder = completeBinder([...slots.values()], ownedByVariant);
  const shown = binder.slots.filter((s) =>
    show === "missing" ? s.owned === 0 : show === "owned" ? s.owned > 0 : true,
  );
  const meta = new Map([...slots.values()].map((s) => [s.variantIds[0], s]));

  return (
    <Shell>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <nav aria-label="Set" className="flex flex-wrap gap-1.5">
          {sets.map((s) => (
            <Link
              key={s.code}
              href={href({ set: s.code })}
              aria-current={s.code === set.code ? "page" : undefined}
              title={s.name}
              className={cn(
                "num inline-flex h-8 items-center rounded-[var(--radius-control)] border px-2.5 text-[13px]",
                s.code === set.code
                  ? "border-quill bg-quill-tint font-medium text-quill"
                  : "border-rule bg-sheet text-ink-2 hover:border-rule-strong",
              )}
            >
              {s.code}
            </Link>
          ))}
        </nav>
      </div>

      <section
        aria-label="Completion"
        className="mt-5 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4 sm:p-5"
        data-testid="binder-summary"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{set.name}</h2>
            <p className="mt-1 text-sm text-ink-2">
              <span
                className="num font-medium text-ink"
                data-testid="binder-have"
              >
                {binder.have}
              </span>{" "}
              of <span className="num">{binder.total}</span>{" "}
              {scope === "base" ? "base cards" : "printings"} ·{" "}
              <span
                className="num font-medium text-ink"
                data-testid="binder-pct"
              >
                {formatPct(binder.pct, false)}
              </span>{" "}
              complete
            </p>
          </div>
          <div className="text-right">
            <p className="eyebrow">Cost to complete</p>
            <p
              className="num text-[22px] font-medium"
              data-testid="binder-cost"
            >
              {formatMoney(binder.costToComplete, display)}
            </p>
            <p className="text-xs text-ink-3">
              cheapest printing of each missing card ·{" "}
              {SOURCE_LABEL[source] ?? source}
              {binder.unpricedMissing > 0 && (
                <> · {binder.unpricedMissing} unpriced</>
              )}
            </p>
          </div>
        </div>
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-inset"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(binder.pct)}
          aria-label="Set completion"
        >
          <div
            className="h-full rounded-full bg-quill"
            style={{ width: `${binder.pct}%` }}
          />
        </div>
        {!editing && (
          <CompleteSet
            key={`${set.code}-${scope}`}
            setCode={set.code}
            setName={set.name}
            scope={scope}
            missing={toAdd.length}
            have={binder.have}
            marketTotal={addTotal}
            unpriced={addUnpriced}
            currency={display}
            locations={locations}
            defaultBinder={suggestBinder(locations, set.code)}
            today={dayKey()}
          />
        )}
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Seg
          label="Checklist"
          items={[
            { key: "base", label: "Base set", href: href({ scope: "base" }) },
            {
              key: "all",
              label: "Every printing",
              href: href({ scope: "all" }),
            },
          ]}
          active={scope}
        />
        {!editing && (
          <Seg
            label="Show"
            items={[
              { key: "all", label: "All", href: href({ show: "all" }) },
              {
                key: "missing",
                label: `Missing (${binder.total - binder.have})`,
                href: href({ show: "missing" }),
              },
              {
                key: "owned",
                label: `Owned (${binder.have})`,
                href: href({ show: "owned" }),
              },
            ]}
            active={show}
          />
        )}
        {editing ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={href({ edit: undefined })}>Done editing</Link>
          </Button>
        ) : (
          <Button asChild size="sm">
            <Link href={href({ edit: "1" })} data-testid="binder-edit">
              <Pencil size={14} aria-hidden /> Edit what I own
            </Link>
          </Button>
        )}
      </div>

      {editing ? (
        <BinderEditor
          key={`${set.code}-${scope}`}
          setCode={set.code}
          setName={set.name}
          scope={scope}
          slots={[...setSlots]
            .sort((x, y) => x.number - y.number || x.name.localeCompare(y.name))
            .map((ss) => ({
              key: ss.key,
              number: ss.number,
              name: ss.name,
              label:
                scope === "all" && ss.art !== "STANDARD"
                  ? (ART_LABEL[ss.art as VariantArt] ?? ss.art)
                  : (ss.rarity ?? ""),
              imageUrl: ss.imageUrl,
              owned: ss.variantIds.reduce(
                (t, v) => t + (ownedByVariant.get(v) ?? 0),
                0,
              ),
            }))}
          locations={locations}
          defaultBinder={suggestBinder(locations, set.code)}
          today={dayKey()}
          doneHref={href({ edit: undefined })}
        />
      ) : (
        <>
          <ul
            className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7"
            data-testid="binder-grid"
          >
            {shown.map((s) => {
              const m = meta.get(s.variantIds[0])!;
              const have = s.owned > 0;
              return (
                <li
                  key={s.variantIds[0]}
                  className="min-w-0"
                  data-owned={have ? "1" : "0"}
                >
                  <Link
                    href={`/cards/${s.cardId}?v=${s.variantIds[0]}`}
                    className="group block"
                  >
                    <span
                      className={cn(
                        "relative block aspect-[744/1039] overflow-hidden rounded-[var(--radius-art)] bg-inset",
                        have
                          ? "ring-1 ring-rule"
                          : "border border-dashed border-rule-strong",
                      )}
                    >
                      {/* Binder pockets are upright: battlefields are turned to fill them, whichever way the source stores them. */}
                      {s.imageUrl && (
                        <FramedImage
                          src={s.imageUrl}
                          alt={s.name}
                          className={cn(!have && "opacity-25 grayscale")}
                        />
                      )}
                      <span className="num absolute top-1.5 left-1.5 rounded-[3px] bg-sheet/95 px-1 text-[10px] text-ink-2">
                        {String(s.number).padStart(3, "0")}
                      </span>
                      {have && (
                        <span className="num absolute right-1.5 bottom-1.5 rounded-[3px] bg-sheet/95 px-1.5 text-[11px] font-medium">
                          ×{s.owned}
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "mt-1 block truncate text-xs",
                        have ? "font-medium text-ink" : "text-ink-3",
                      )}
                    >
                      {s.name}
                    </span>
                    <span className="flex justify-between gap-1 text-[11px] text-ink-3">
                      <span className="truncate">
                        {scope === "all" && m.art !== "STANDARD"
                          ? (ART_LABEL[m.art as VariantArt] ?? m.art)
                          : (s.rarity ?? "")}
                      </span>
                      {!have && (
                        <span className="num">
                          {s.cheapest != null
                            ? formatMoney(s.cheapest, display, {
                                compact: true,
                              })
                            : "—"}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {shown.length === 0 && (
            <p className="mt-6 text-center text-sm text-ink-3">
              {show === "missing"
                ? "Nothing missing — set complete."
                : "You don't own any of these yet."}
            </p>
          )}
        </>
      )}
    </Shell>
  );
}

function Seg({
  label,
  items,
  active,
}: {
  label: string;
  items: { key: string; label: string; href: string }[];
  active: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-[var(--radius-control)] border border-rule bg-inset p-0.5 text-[13px]"
    >
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={i.key === active ? "true" : undefined}
          scroll={false}
          className={cn(
            "inline-flex h-7 items-center rounded-[3px] px-2.5",
            i.key === active
              ? "bg-sheet font-medium text-ink shadow-[0_0_0_1px_var(--rule)]"
              : "text-ink-3 hover:text-ink",
          )}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1080px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Collection"
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <Button asChild variant="secondary">
              <Link href="/collection/import">Import</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/collection/add">Add purchase</Link>
            </Button>
            <Button asChild>
              <Link href="/collection/binder?edit=1">Add cards I own</Link>
            </Button>
          </div>
        }
      />
      <CollectionTabs active="binder" />
      {children}
    </div>
  );
}
