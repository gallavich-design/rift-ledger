import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { addDays, dayKey } from "@/config/app";
import { getFx, getPriceBook, getPriceSeries, getSettings } from "@/lib/portfolio/data";
import { priceOn } from "@/lib/portfolio/compute";
import { ART_LABEL, type VariantArt } from "@/lib/domain/enums";
import { convert, formatMoney } from "@/lib/money/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { CardArt, Ticker } from "@/components/cards/bits";
import { Delta, SourceStamp } from "@/components/money/Money";
import { NewSetBanner } from "@/components/shell/NewSetBanner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Watchlist" };

export default async function WatchlistPage() {
  const userId = await getCurrentUserId();
  const settings = await getSettings(db, userId);
  const fx = await getFx(db, settings.fxOverrides);
  const today = dayKey();
  const watches = await db.watchItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { variant: { include: { card: true, set: true } }, deck: { select: { id: true, name: true } } },
  });
  const ids = watches.map((w) => w.variantId);
  const [book, series] = await Promise.all([getPriceBook(db, userId, ids, settings.defaultValuationSource), getPriceSeries(db, userId, ids, settings.defaultValuationSource, addDays(today, -14))]);

  return (
    <div className="mx-auto max-w-[1080px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader title="Watchlist" description="Cards you're tracking without owning. Set a target and you'll get an alert when the price crosses it." />
      <NewSetBanner />
      {watches.length === 0 ? (
        <div className="rounded-[var(--radius-panel)] border border-dashed border-rule-strong px-6 py-12 text-center">
          <p className="font-medium">Nothing watched yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-3">
            Open any card and use <strong className="font-medium">Watch</strong> to track its price — handy for cards a deck still needs, or new reveals before release.
          </p>
          <Link href="/cards" className="mt-4 inline-flex h-9 items-center rounded-[var(--radius-control)] bg-quill px-4 text-sm font-medium text-quill-ink hover:bg-quill/90">
            Browse cards
          </Link>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-sheet" data-testid="watchlist">
          {watches.map((w) => {
            const v = w.variant;
            const cur = w.currency ?? settings.displayCurrency;
            const q = book.get(w.variantId);
            const conv = (a: number, c: string) => (fx.table[c] && fx.table[cur] ? convert(a, c, cur, fx.table) : null);
            const price = q ? conv(q.amount, q.currency) : null;
            const wk = priceOn(series.get(w.variantId), addDays(today, -7));
            const weekAgo = wk ? conv(wk.amount, wk.currency) : null;
            const toTarget = price != null && w.targetPrice ? ((w.targetPrice - price) / price) * 100 : null;
            const reached = price != null && w.targetPrice != null && (w.targetDir === "BELOW" ? price <= w.targetPrice : price >= w.targetPrice);
            return (
              <li key={w.id} className="border-b border-rule-soft last:border-b-0">
                <Link href={`/cards/${v.cardId}?v=${v.id}#watch`} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-hover md:grid-cols-[40px_minmax(0,1fr)_140px_160px_120px]">
                  <span className="w-10">
                    <CardArt src={v.imageUrl} alt="" landscape={v.card.orientation === "landscape"} className="rounded-[4px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium">{v.card.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-3">
                      <Ticker setCode={v.set.code} number={v.collectorNumber} /> {ART_LABEL[v.art as VariantArt]} · {v.finish === "FOIL" ? "Foil" : "Normal"}
                      {w.deck && <> · for {w.deck.name}</>}
                    </span>
                  </span>
                  <span className="text-right text-sm md:text-right">
                    <span className="num block font-medium">{price != null ? formatMoney(price, cur) : "—"}</span>
                    {q && <SourceStamp source={q.source} asOf={q.asOf} className="block truncate text-[11px]" />}
                  </span>
                  <span className="col-span-2 text-xs md:col-span-1 md:text-right">
                    {w.targetPrice != null ? (
                      <>
                        <span className="text-ink-2">
                          Alert {w.targetDir === "BELOW" ? "≤" : "≥"} <span className="num">{formatMoney(w.targetPrice, cur)}</span>
                        </span>
                        <span className={`block ${reached ? "font-medium text-gain" : "text-ink-3"}`}>{reached ? "✓ Target reached" : toTarget != null ? `${Math.abs(toTarget).toFixed(1)}% to go` : "waiting for a price"}</span>
                      </>
                    ) : (
                      <span className="text-ink-3">{w.movePct ? `Alert on ±${w.movePct}% in 7 days` : "No target"}</span>
                    )}
                  </span>
                  <span className="text-right text-xs">
                    <span className="block text-ink-3">7 days</span>
                    <Delta amount={null} pct={price != null && weekAgo ? ((price - weekAgo) / weekAgo) * 100 : null} />
                    {w.preorderPrice != null && price != null && (
                      <span className="block text-ink-3">
                        since pre-order <Delta amount={null} pct={((price - w.preorderPrice) / w.preorderPrice) * 100} />
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
