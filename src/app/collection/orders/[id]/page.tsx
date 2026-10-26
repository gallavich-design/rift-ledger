import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { formatMoney } from "@/lib/money/money";
import { ART_LABEL, type VariantArt } from "@/lib/domain/enums";
import { CardArt, Ticker } from "@/components/cards/bits";
import { PageHeader } from "@/components/ui/PageHeader";
import { DeleteOrderButton } from "./DeleteOrderButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const userId = await getCurrentUserId();
  const order = await db.order.findFirst({
    where: { id, userId },
    include: {
      lots: {
        orderBy: { createdAt: "asc" },
        include: {
          variant: { include: { card: { select: { id: true, name: true, orientation: true } }, set: { select: { code: true } } } },
          storageLocation: { select: { name: true } },
          _count: { select: { saleAllocations: true } },
        },
      },
    },
  });
  if (!order) notFound();
  const c = order.currency;
  const subtotal = order.lots.reduce((a, l) => a + l.unitPrice * l.quantity, 0);
  const extras = order.shipping + order.forwardingFee + order.importTax + order.otherFees;
  const landed = order.lots.reduce((a, l) => a + l.landedTotal, 0);
  const hasSales = order.lots.some((l) => l._count.saleAllocations > 0);

  return (
    <div className="mx-auto max-w-[880px] px-4 py-6 md:px-8 md:py-8">
      <Link href="/collection/orders" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> Orders
      </Link>
      {saved && (
        <p role="status" className="mb-5 flex items-center gap-2 rounded-[var(--radius-panel)] border border-gain/30 bg-gain-tint px-4 py-3 text-sm text-gain">
          <CheckCircle2 size={16} aria-hidden /> Saved. {order.lots.length === 1 ? "The card is" : `All ${order.lots.length} cards are`} in your collection.
        </p>
      )}
      <PageHeader
        title={order.seller}
        description={`${order.orderedOn.toLocaleDateString("en-GB", { dateStyle: "long", timeZone: "Asia/Bangkok" })} · paid in ${c}`}
        actions={<DeleteOrderButton orderId={order.id} disabled={hasSales} />}
      />

      <section aria-labelledby="lines-h">
        <h2 id="lines-h" className="sr-only">
          Cards in this order
        </h2>
        <div className="overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-sheet">
          <table className="w-full text-sm">
            <thead className="hidden border-b border-rule text-left sm:table-header-group">
              <tr className="eyebrow">
                <th className="px-4 py-2 font-medium">Card</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Price each</th>
                <th className="px-3 py-2 text-right font-medium">+ Extras</th>
                <th className="px-3 py-2 text-right font-medium">Landed each</th>
                <th className="px-4 py-2 text-right font-medium">Landed total</th>
              </tr>
            </thead>
            <tbody>
              {order.lots.map((l) => (
                <tr key={l.id} className="block border-b border-rule-soft px-4 py-3 last:border-b-0 sm:table-row sm:p-0" data-testid="order-line">
                  <td className="block sm:table-cell sm:px-4 sm:py-3">
                    <Link href={`/cards/${l.variant.card.id}?v=${l.variant.id}`} className="flex items-center gap-3 hover:text-quill">
                      <span className="w-9 shrink-0">
                        <CardArt src={l.variant.imageUrl} alt="" landscape={l.variant.card.orientation === "landscape"} className="rounded-[3px]" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{l.variant.card.name}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                          <Ticker setCode={l.variant.set.code} number={l.variant.collectorNumber} />
                          {ART_LABEL[l.variant.art as VariantArt]} · {l.variant.finish === "FOIL" ? "Foil" : "Normal"} · {l.condition}
                          {l.storageLocation && <> · {l.storageLocation.name}</>}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <Cell label="Qty">{l.quantity}</Cell>
                  <Cell label="Price each">{formatMoney(l.unitPrice, c)}</Cell>
                  <Cell label="+ Extras">{formatMoney(l.landedTotal - l.unitPrice * l.quantity, c)}</Cell>
                  <Cell label="Landed each" strong testid="landed-each">
                    {formatMoney(Math.floor(l.landedTotal / l.quantity), c)}
                    {l.landedTotal % l.quantity !== 0 && <span className="text-ink-3">*</span>}
                  </Cell>
                  <Cell label="Landed total" last>
                    {formatMoney(l.landedTotal, c)}
                  </Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {order.lots.some((l) => l.landedTotal % l.quantity !== 0) && (
          <p className="mt-2 text-xs text-ink-3">* Rounded down per copy; the line total is exact.</p>
        )}
      </section>

      <section className="mt-6 ml-auto max-w-sm rounded-[var(--radius-panel)] border border-rule bg-sheet p-4" aria-label="Order totals">
        <dl className="space-y-1.5 text-sm">
          <Row label="Items" value={formatMoney(subtotal, c)} />
          {order.shipping > 0 && <Row label="Shipping to forwarder" value={formatMoney(order.shipping, c)} />}
          {order.forwardingFee > 0 && <Row label="Forwarding fee" value={formatMoney(order.forwardingFee, c)} />}
          {order.importTax > 0 && <Row label="Import duty / tax" value={formatMoney(order.importTax, c)} />}
          {order.otherFees > 0 && <Row label="Other fees" value={formatMoney(order.otherFees, c)} />}
          <div className="flex justify-between border-t border-rule pt-2 font-medium">
            <dt>Landed total</dt>
            <dd className="num">{formatMoney(landed, c)}</dd>
          </div>
          {extras > 0 && subtotal > 0 && (
            <p className="pt-1 text-xs text-ink-3">
              Extras added <span className="num">{((extras / subtotal) * 100).toFixed(1)}%</span>{" "}on top of the card prices.
            </p>
          )}
        </dl>
      </section>
    </div>
  );
}

function Cell({ label, children, strong, last, testid }: { label: string; children: React.ReactNode; strong?: boolean; last?: boolean; testid?: string }) {
  return (
    <td data-testid={testid} className={`num flex justify-between py-0.5 sm:table-cell sm:px-3 sm:py-3 sm:text-right ${last ? "sm:pr-4" : ""} ${strong ? "font-medium text-ink" : "text-ink-2"}`}>
      <span className="text-xs text-ink-3 sm:hidden">{label}</span>
      <span>{children}</span>
    </td>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-ink-2">
      <dt>{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
}
