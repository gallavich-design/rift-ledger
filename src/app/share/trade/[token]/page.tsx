import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { loadTradeLists, type TradeRow } from "@/lib/trade/lists";
import { variantLabel } from "@/lib/catalog/variantLabel";
import { SourceStamp } from "@/components/money/Money";
import { formatMoney } from "@/lib/money/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Haves & wants", robots: { index: false } };

// Read-only haves/wants. Shows the lists and market prices only — never the owner, costs or holdings.
export default async function SharedTradePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await db.settings.findUnique({ where: { tradeShareToken: token }, include: { user: { select: { isDemo: true } } } });
  if (!s) notFound();
  const lists = await loadTradeLists(db, s.userId, s.user.isDemo);
  return (
    <div className="mx-auto max-w-[960px] px-4 py-6 md:px-8 md:py-8">
      <p className="eyebrow">Shared trade list · read only</p>
      <h1 className="mt-1 mb-6 text-[28px] leading-tight font-semibold tracking-[-0.015em]">Haves &amp; wants</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <List title="Has for trade" rows={lists.haves} currency={lists.currency} testid="shared-haves" />
        <List title="Looking for" rows={lists.wants} currency={lists.currency} testid="shared-wants" />
      </div>
    </div>
  );
}

function List({ title, rows, currency, testid }: { title: string; rows: TradeRow[]; currency: string; testid: string }) {
  return (
    <section className="rounded-[var(--radius-panel)] border border-rule bg-sheet" data-testid={testid}>
      <h2 className="eyebrow border-b border-rule px-4 py-2.5">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-3">Nothing listed.</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 border-b border-rule-soft px-4 py-2.5 last:border-b-0">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  <span className="num text-ink-3">{r.quantity}×</span> {r.variant.name}
                </span>
                <span className="num block truncate text-xs text-ink-3">{variantLabel(r.variant)}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="num block text-sm">{r.quote ? formatMoney(r.quote.unit, currency) : "—"}</span>
                {r.quote && <SourceStamp source={r.quote.source} asOf={new Date(r.quote.asOf)} />}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
