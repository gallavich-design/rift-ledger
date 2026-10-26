import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { searchCards } from "@/lib/catalog/search";
import { CardArt, Ticker } from "@/components/cards/bits";
import { DomainStripe } from "@/components/cards/DomainStripe";
import { SearchField } from "@/components/cards/SearchField";
import { DOMAIN_ORDER, domainColor } from "@/config/domains";
import { cn } from "@/lib/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Cards" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 48;
const TYPES = ["Legend", "Unit", "Spell", "Gear", "Battlefield", "Rune"];

type SP = Record<string, string | undefined>;

function hrefWith(sp: SP, patch: SP) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) next.set(k, v);
  if (!("page" in patch)) next.delete("page");
  const s = next.toString();
  return s ? `/cards?${s}` : "/cards";
}

export default async function CardsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const page = Math.max(1, Number(sp.page) || 1);

  const sets = await db.set.findMany({ orderBy: [{ releaseDate: "desc" }, { name: "asc" }] });
  const where: Prisma.CardWhereInput = {
    ...(sp.set ? { variants: { some: { set: { code: sp.set } } } } : {}),
    ...(sp.type ? { type: sp.type } : {}),
    ...(sp.domain ? { domains: { contains: `|${sp.domain}|` } } : {}),
  };
  const select = {
    id: true,
    name: true,
    type: true,
    domains: true,
    imageUrl: true,
    orientation: true,
    collectorNumber: true,
    set: { select: { code: true } },
    _count: { select: { variants: true } },
  } as const;

  let cards: Prisma.CardGetPayload<{ select: typeof select }>[];
  let total: number;
  if (q) {
    // Ranked typo-tolerant search, then filters applied to the ranked ids (order preserved).
    const ranked = await searchCards(db, q, 200);
    const rows = await db.card.findMany({ where: { ...where, id: { in: ranked.map((r) => r.id) } }, select });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ranked.map((r) => byId.get(r.id)).filter((r): r is NonNullable<typeof r> => !!r);
    total = ordered.length;
    cards = ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  } else {
    [total, cards] = await Promise.all([
      db.card.count({ where }),
      db.card.findMany({
        where,
        select,
        orderBy: [{ name: "asc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);
  }
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const catalogEmpty = sets.length === 0;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Cards"
        description={
          catalogEmpty ? undefined : (
            <>
              <span className="num text-ink-2">{total.toLocaleString("en-US")}</span> {total === 1 ? "card" : "cards"}
              {q && <> matching “{q}”</>}
            </>
          )
        }
      />

      {catalogEmpty ? (
        <EmptyState
          title="The card catalogue is empty"
          body="Sync from Riftcodex to download every released set. It takes about a minute."
          action={{ href: "/settings#catalog", label: "Go to sync" }}
        />
      ) : (
        <>
          <div className="space-y-3">
            <SearchField defaultValue={q} />
            <FilterRow label="Set">
              <Chip href={hrefWith(sp, { set: undefined })} active={!sp.set}>
                All
              </Chip>
              {sets.map((s) => (
                <Chip key={s.code} href={hrefWith(sp, { set: s.code })} active={sp.set === s.code} title={s.name}>
                  <span className="num">{s.code}</span>
                  <span className="hidden text-ink-3 lg:inline">{s.name}</span>
                </Chip>
              ))}
            </FilterRow>
            <FilterRow label="Type">
              <Chip href={hrefWith(sp, { type: undefined })} active={!sp.type}>
                All
              </Chip>
              {TYPES.map((t) => (
                <Chip key={t} href={hrefWith(sp, { type: t })} active={sp.type === t}>
                  {t}
                </Chip>
              ))}
            </FilterRow>
            <FilterRow label="Domain">
              <Chip href={hrefWith(sp, { domain: undefined })} active={!sp.domain}>
                All
              </Chip>
              {DOMAIN_ORDER.map((d) => (
                <Chip key={d} href={hrefWith(sp, { domain: d })} active={sp.domain === d}>
                  <span className="size-2 rounded-full" style={{ background: domainColor(d).solid }} aria-hidden />
                  {d}
                </Chip>
              ))}
            </FilterRow>
          </div>

          {cards.length === 0 ? (
            <EmptyState
              title="No cards match"
              body="Try a different spelling or clear a filter."
              action={{ href: "/cards", label: "Clear all" }}
            />
          ) : (
            <ul className="mt-6 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {cards.map((c, i) => (
                <li key={c.id} className="min-w-0">
                  <Link href={`/cards/${c.id}`} className="group block rounded-[var(--radius-art)]">
                    <span className="relative block">
                      <CardArt src={c.imageUrl} alt={c.name} landscape={c.orientation === "landscape"} priority={i < 6} className="group-hover:ring-rule-strong" />
                      <DomainStripe domains={c.domains} className="absolute inset-x-3 top-0 h-[3px] overflow-hidden rounded-b-[2px]" />
                    </span>
                    <span className="mt-2 block truncate text-sm font-medium group-hover:text-quill">{c.name}</span>
                    <span className="mt-1 flex items-center gap-1.5 text-xs text-ink-3">
                      <Ticker setCode={c.set.code} number={c.collectorNumber} />
                      <span className="truncate">{c.type}</span>
                      {c._count.variants > 1 && (
                        <span className="ml-auto shrink-0" title={`${c._count.variants} printings`}>
                          <span className="num">{c._count.variants}</span> prints
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {pages > 1 && (
            <nav aria-label="Pagination" className="mt-8 flex items-center justify-between border-t border-rule pt-4 text-sm">
              <PageLink href={hrefWith(sp, { page: String(page - 1) })} disabled={page <= 1}>
                ← Previous
              </PageLink>
              <span className="num text-ink-3">
                {page} / {pages}
              </span>
              <PageLink href={hrefWith(sp, { page: String(page + 1) })} disabled={page >= pages}>
                Next →
              </PageLink>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="eyebrow w-14 shrink-0">{label}</span>
      <div className="-my-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1 pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)] [scrollbar-width:none]">{children}</div>
    </div>
  );
}

function Chip({ href, active, children, title }: { href: string; active: boolean; children: React.ReactNode; title?: string }) {
  return (
    <Link
      href={href}
      title={title}
      aria-current={active ? "true" : undefined}
      scroll={false}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap",
        active ? "border-quill bg-quill-tint font-medium text-quill" : "border-rule bg-sheet text-ink-2 hover:border-rule-strong",
      )}
    >
      {children}
    </Link>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) return <span className="text-ink-4">{children}</span>;
  return (
    <Link href={href} className="text-quill hover:underline">
      {children}
    </Link>
  );
}
