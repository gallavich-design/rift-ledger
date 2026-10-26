import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { formatMoney } from "@/lib/money/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { CollectionTabs } from "../CollectionTabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders" };

export default async function OrdersPage() {
  const userId = await getCurrentUserId();
  const [orders, sales] = await Promise.all([
    db.order.findMany({ where: { userId }, orderBy: [{ orderedOn: "desc" }, { createdAt: "desc" }], include: { lots: { select: { quantity: true, landedTotal: true } } } }),
    db.sale.findMany({
      where: { userId },
      orderBy: { soldOn: "desc" },
      include: { allocations: { select: { costBasis: true, lot: { select: { currency: true } } } } },
      take: 50,
    }),
  ]);
  const variantNames = new Map(
    (await db.cardVariant.findMany({ where: { id: { in: sales.map((s) => s.variantId) } }, select: { id: true, card: { select: { name: true, id: true } } } })).map((v) => [v.id, v.card]),
  );

  return (
    <div className="mx-auto max-w-[1080px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Collection"
        actions={
          <Button asChild>
            <Link href="/collection/add">Add purchase</Link>
          </Button>
        }
      />
      <CollectionTabs active="orders" />

      <h2 className="mt-6 mb-2 text-base font-semibold">Purchases</h2>
      {orders.length === 0 ? (
        <EmptyState title="No purchases yet" body="Add your first order to start tracking value." action={{ href: "/collection/add", label: "Add purchase" }} />
      ) : (
        <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-sheet">
          {orders.map((o) => {
            const copies = o.lots.reduce((a, l) => a + l.quantity, 0);
            const total = o.lots.reduce((a, l) => a + l.landedTotal, 0);
            return (
              <li key={o.id} className="border-b border-rule-soft last:border-b-0">
                <Link href={`/collection/orders/${o.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-hover">
                  <span className="num w-24 shrink-0 text-xs text-ink-3">{o.orderedOn.toISOString().slice(0, 10)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{o.seller}</span>
                  <span className="hidden text-xs text-ink-3 sm:inline">
                    <span className="num">{copies}</span> {copies === 1 ? "card" : "cards"}
                  </span>
                  <span className="num w-28 shrink-0 text-right text-sm">{formatMoney(total, o.currency)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {sales.length > 0 && (
        <>
          <h2 className="mt-8 mb-2 text-base font-semibold">Sales</h2>
          <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-sheet">
            {sales.map((s) => {
              const card = variantNames.get(s.variantId);
              const proceeds = s.quantity * s.unitPrice - s.fees;
              const sameCurrency = s.allocations.every((a) => a.lot.currency === s.currency);
              const pl = proceeds - s.allocations.reduce((a, x) => a + x.costBasis, 0);
              return (
                <li key={s.id} className="flex items-center gap-4 border-b border-rule-soft px-4 py-3 last:border-b-0">
                  <span className="num w-24 shrink-0 text-xs text-ink-3">{s.soldOn.toISOString().slice(0, 10)}</span>
                  <Link href={card ? `/cards/${card.id}` : "#"} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-quill">
                    <span className="num">{s.quantity}×</span> {card?.name ?? "Unknown card"}
                  </Link>
                  <span className="num w-28 shrink-0 text-right text-sm">{formatMoney(proceeds, s.currency)}</span>
                  <span className={`num hidden w-28 shrink-0 text-right text-sm sm:inline ${sameCurrency ? (pl >= 0 ? "text-gain" : "text-loss") : "text-ink-3"}`}>
                    {sameCurrency ? `${pl >= 0 ? "▲" : "▼"} ${formatMoney(pl, s.currency, { sign: true })}` : "mixed currency"}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
