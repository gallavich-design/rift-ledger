import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUserId, isDemoMode } from "@/lib/currentUser";
import { addDays, dayKey } from "@/config/app";
import {
  availableSources,
  getFx,
  getPriceBook,
  getPriceSeries,
  getSettings,
  loadLotsAndSales,
  loadVariantInfo,
  missingRates,
  seriesDays,
} from "@/lib/portfolio/data";
import { breakdown, computeHistory, computeMovers, computePositions, computeTotals, type Mover } from "@/lib/portfolio/compute";
import { ART_LABEL, SOURCE_LABEL, SOURCE_SHORT, type VariantArt } from "@/lib/domain/enums";
import { formatMoney } from "@/lib/money/money";
import { COST_COLOR, VALUE_COLOR } from "@/config/chartColors";
import { LineChart } from "@/components/charts/LineChart";
import { BreakdownBars } from "@/components/charts/BreakdownBars";
import { Delta, MoneyText, SourceStamp } from "@/components/money/Money";
import { FxMissing } from "@/components/money/FxMissing";
import { CardArt, Ticker } from "@/components/cards/bits";
import { DomainStripe } from "@/components/cards/DomainStripe";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

type SP = { source?: string; movers?: string };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const userId = await getCurrentUserId();
  const demo = await isDemoMode();
  const settings = await getSettings(db, userId);
  const sources = await availableSources(db, userId, demo);
  const source = sp.source && sources.includes(sp.source) ? sp.source : sources.includes(settings.defaultValuationSource) ? settings.defaultValuationSource : sources[0];
  const display = settings.displayCurrency;
  const today = dayKey();

  const [fx, { lots, lotInputs, saleInputs }] = await Promise.all([getFx(db, settings.fxOverrides), loadLotsAndSales(db, userId)]);

  if (lots.length === 0) {
    return (
      <Shell sources={sources} source={source} display={display}>
        <EmptyState
          title="Add your first order to start tracking value"
          body="Enter a purchase — a whole TCGplayer + forwarder order or one card from a local shop — and the dashboard fills in."
          action={{ href: "/collection/add", label: "Add purchase" }}
        />
        <p className="mt-4 text-center text-sm text-ink-3">
          Or{" "}
          <Link href="/settings#demo" className="text-quill hover:underline">
            load demo data
          </Link>{" "}
          to look around first.
        </p>
      </Shell>
    );
  }

  const variantIds = [...new Set(lots.map((l) => l.variantId))];
  const [prices, series, info] = await Promise.all([
    getPriceBook(db, userId, variantIds, source),
    getPriceSeries(db, userId, variantIds, source),
    loadVariantInfo(db, variantIds),
  ]);
  const quoteCurrencies = [...prices.values()].map((p) => p.currency);
  const missing = missingRates(fx.table, [display, ...lots.map((l) => l.currency), ...quoteCurrencies, ...saleInputs.map((s) => s.currency)]);
  if (missing.length) {
    return (
      <Shell sources={sources} source={source} display={display}>
        <FxMissing />
      </Shell>
    );
  }

  const positions = computePositions(lotInputs, prices, fx.table, display, settings.conditionMultipliers);
  const totals = computeTotals(positions, saleInputs, fx.table, display);
  const days = seriesDays(series);
  const history = computeHistory(days, lotInputs, saleInputs, series, fx.table, display, settings.conditionMultipliers);

  // Today's change: latest price day vs the price day before it, for cards held now.
  const lastDay = days[days.length - 1];
  const prevDay = days.length > 1 ? days[days.length - 2] : undefined;
  const dayMoves = lastDay && prevDay ? computeMovers(positions, series, prevDay, lastDay, fx.table, display) : [];
  const todayChange = prevDay ? dayMoves.reduce((a, m) => a + m.changeAmount, 0) : null;
  const prevValue = history.find((h) => h.day === prevDay)?.value;

  // Gainers & losers over the last 7 days (or since the first price day if newer).
  const weekFrom = lastDay ? [addDays(lastDay, -7), days[0]].sort()[1] : undefined;
  const movers = lastDay && weekFrom && weekFrom < lastDay ? computeMovers(positions, series, weekFrom, lastDay, fx.table, display) : [];
  const byAmount = sp.movers === "amount";
  const rank = (m: Mover) => (byAmount ? m.changeAmount : m.changePct);
  const gainers = movers.filter((m) => m.to > m.from).sort((a, b) => rank(b) - rank(a)).slice(0, 5);
  const losers = movers.filter((m) => m.to < m.from).sort((a, b) => rank(a) - rank(b)).slice(0, 5);

  const biggest = [...positions].filter((p) => p.value != null).sort((a, b) => b.value! - a.value!).slice(0, 6);
  const latestStamp = [...prices.values()].sort((a, b) => b.asOf.getTime() - a.asOf.getTime())[0];

  const get = (id: string) => info.get(id)!;
  const breakdowns = [
    { title: "By set", rows: breakdown(positions, (p) => get(p.variantId).setName) },
    { title: "By rarity", rows: breakdown(positions, (p) => get(p.variantId).rarity) },
    { title: "By domain", rows: breakdown(positions, (p) => (get(p.variantId).domains.length ? get(p.variantId).domains : ["Colorless"])) },
    { title: "By printing", rows: breakdown(positions, (p) => ART_LABEL[get(p.variantId).art as VariantArt] ?? get(p.variantId).art) },
    { title: "By finish", rows: breakdown(positions, (p) => (get(p.variantId).finish === "FOIL" ? "Foil" : "Normal")) },
    { title: "By language", rows: breakdown(positions, (p) => get(p.variantId).language) },
    { title: "Graded vs raw", rows: breakdown(positions, (p) => (get(p.variantId).graded ? "Graded" : "Raw")) },
  ];

  const fxNote = display !== "USD" && fx.rates.find((r) => r.quote === display);

  return (
    <Shell sources={sources} source={source} display={display}>
      {/* Headline: one hero number, then a ledger strip — not five identical tiles */}
      <section aria-label="Portfolio summary" className="grid gap-6 border-b border-rule pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-end">
        <div>
          <p className="eyebrow">Market value</p>
          <p className="num mt-1 text-[40px] leading-none font-medium tracking-[-0.02em] sm:text-[48px]" data-testid="total-value">
            {formatMoney(totals.value, display)}
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <Delta amount={totals.unrealized} currency={display} pct={totals.unrealizedPct} />
            <span className="text-ink-3">unrealized</span>
          </div>
          {latestStamp && (
            <p className="mt-2">
              <SourceStamp source={source} asOf={latestStamp.asOf} />
              {totals.unpricedPositions > 0 && (
                <span className="text-xs text-ink-3">
                  {" "}
                  · <span className="num">{totals.unpricedPositions}</span> unpriced
                </span>
              )}
            </p>
          )}
        </div>
        <dl className="grid min-w-0 grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-rule sm:grid-cols-4">
          <Stat label="Cost basis" hint="landed">
            <MoneyText amount={totals.cost} currency={display} />
          </Stat>
          <Stat label="Unrealized" hint={totals.unrealizedPct != null ? undefined : "—"}>
            <Delta amount={totals.unrealized} currency={display} />
          </Stat>
          <Stat label="Realized" hint="from sales">
            <span data-testid="realized">
              <Delta amount={totals.realized} currency={display} />
            </span>
          </Stat>
          <Stat label="Today's change" hint={prevDay ? `vs ${shortDay(prevDay)}` : "needs 2 days"}>
            {todayChange == null ? (
              <span className="num text-ink-3">—</span>
            ) : (
              <>
                <Delta amount={todayChange} currency={display} />
                {prevValue ? <Delta amount={null} pct={(todayChange / prevValue) * 100} className="block text-xs font-normal" /> : null}
              </>
            )}
          </Stat>
        </dl>
      </section>

      <section aria-labelledby="chart-h" className="mt-6 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4 sm:p-5">
        <h2 id="chart-h" className="mb-3 text-base font-semibold">
          Portfolio value
        </h2>
        <LineChart
          ariaLabel={`Portfolio value and cost basis over time, ${history.length} days`}
          currency={display}
          today={today}
          defaultRange="ALL"
          series={[
            { id: "value", name: `Market value (${SOURCE_SHORT[source]})`, color: VALUE_COLOR, points: history.map((h) => ({ day: h.day, value: h.value })) },
            { id: "cost", name: "Cost basis", color: COST_COLOR, dashed: true, points: history.map((h) => ({ day: h.day, value: h.cost })) },
          ]}
        />
      </section>

      <section aria-labelledby="movers-h" className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="movers-h" className="text-base font-semibold">
            Movers{" "}
            <span className="text-sm font-normal text-ink-3">
              {weekFrom && lastDay && weekFrom < lastDay ? (
                <>
                  <span className="num">{shortDay(weekFrom)}</span> → <span className="num">{shortDay(lastDay)}</span>
                </>
              ) : (
                "need two days of prices"
              )}
            </span>
          </h2>
          <div role="group" aria-label="Rank movers by" className="inline-flex rounded-[var(--radius-control)] border border-rule bg-inset p-0.5 text-[12px]">
            <Toggle href="?" active={!byAmount} keep={{ source: sp.source }}>
              By %
            </Toggle>
            <Toggle href="?movers=amount" active={byAmount} keep={{ source: sp.source }}>
              By amount
            </Toggle>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <MoverList title="Top gainers" items={gainers} info={info} currency={display} empty="No gainers yet." />
          <MoverList title="Top losers" items={losers} info={info} currency={display} empty="No losers yet." />
        </div>
      </section>

      <section aria-labelledby="big-h" className="mt-6">
        <h2 id="big-h" className="mb-3 text-base font-semibold">
          Biggest positions
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {biggest.map((p) => {
            const v = get(p.variantId);
            return (
              <li key={p.variantId} className="min-w-0">
                <Link href={`/cards/${v.cardId}?v=${v.id}`} className="group block">
                  <span className="relative block">
                    <CardArt src={v.imageUrl} alt={v.name} landscape={v.orientation === "landscape"} />
                    <DomainStripe domains={v.domains} className="absolute inset-x-3 top-0 h-[3px] overflow-hidden rounded-b-[2px]" />
                    <span className="num absolute right-2 bottom-2 rounded-[3px] bg-sheet/95 px-1.5 py-0.5 text-[11px] font-medium text-ink">×{p.quantity}</span>
                  </span>
                  <span className="mt-2 block truncate text-sm font-medium group-hover:text-quill">{v.name}</span>
                  <span className="mt-0.5 flex items-baseline justify-between gap-2 text-xs">
                    <MoneyText amount={p.value} currency={display} className="text-ink" />
                    <Delta amount={null} pct={p.plPct} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="mix-h" className="mt-8">
        <h2 id="mix-h" className="mb-3 text-base font-semibold">
          Where the value is
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {breakdowns
            .filter((b) => b.rows.length > 1 || b.title === "By set")
            .map((b) => (
              <BreakdownBars key={b.title} title={b.title} rows={b.rows} currency={display} total={totals.value} />
            ))}
        </div>
        <p className="mt-2 text-xs text-ink-3">Breakdowns with a single bucket (e.g. everything raw, all English) are hidden. Sealed products join in Phase 5.</p>
      </section>

      <p className="mt-8 text-xs text-ink-3">
        Values in {display}
        {fxNote && (
          <>
            {" "}
            at <span className="num">1 USD = {(fxNote.rateE6 / 1e6).toFixed(2)} {display}</span> ({fxNote.overridden ? "your override" : `${fxNote.source}`})
          </>
        )}
        . Original purchase and price currencies are stored unchanged and converted only for display.
      </p>
    </Shell>
  );
}

function shortDay(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function Shell({ children, sources, source, display }: { children: React.ReactNode; sources: string[]; source: string; display: string }) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.015em]">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-3">
            In <span className="num">{display}</span> · change currency in{" "}
            <Link href="/settings#money" className="text-quill hover:underline">
              Settings
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sources.length > 1 && (
            <div role="group" aria-label="Valuation source" className="inline-flex rounded-[var(--radius-control)] border border-rule bg-inset p-0.5 text-[13px]">
              {sources.map((s) => (
                <Link
                  key={s}
                  href={`/dashboard?source=${s}`}
                  aria-current={s === source ? "true" : undefined}
                  className={cn("inline-flex h-8 items-center rounded-[3px] px-3", s === source ? "bg-sheet font-medium text-ink shadow-[0_0_0_1px_var(--rule)]" : "text-ink-3 hover:text-ink")}
                  title={SOURCE_LABEL[s]}
                >
                  {SOURCE_SHORT[s]}
                </Link>
              ))}
            </div>
          )}
          <Button asChild variant="secondary">
            <Link href="/collection/add">Add purchase</Link>
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-sheet px-4 py-3">
      <dt className="eyebrow flex items-baseline justify-between gap-2">
        {label}
        {hint && <span className="normal-case tracking-normal text-ink-3">{hint}</span>}
      </dt>
      <dd className="mt-1.5 text-[17px] font-medium">{children}</dd>
    </div>
  );
}

function Toggle({ href, active, keep, children }: { href: string; active: boolean; keep: Record<string, string | undefined>; children: React.ReactNode }) {
  const p = new URLSearchParams(href.slice(1));
  for (const [k, v] of Object.entries(keep)) if (v) p.set(k, v);
  const s = p.toString();
  return (
    <Link href={s ? `/dashboard?${s}` : "/dashboard"} aria-current={active ? "true" : undefined} className={cn("inline-flex h-7 items-center rounded-[3px] px-2.5", active ? "bg-sheet font-medium text-ink shadow-[0_0_0_1px_var(--rule)]" : "text-ink-3 hover:text-ink")} scroll={false}>
      {children}
    </Link>
  );
}

function MoverList({
  title,
  items,
  info,
  currency,
  empty,
}: {
  title: string;
  items: Mover[];
  info: Awaited<ReturnType<typeof loadVariantInfo>>;
  currency: string;
  empty: string;
}) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-rule bg-sheet" data-testid={title}>
      <h3 className="eyebrow border-b border-rule px-4 py-2.5">{title}</h3>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-3">{empty}</p>
      ) : (
        <ol>
          {items.map((m) => {
            const v = info.get(m.variantId)!;
            return (
              <li key={m.variantId} className="border-b border-rule-soft last:border-b-0">
                <Link href={`/cards/${v.cardId}?v=${v.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2.5 hover:bg-hover">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{v.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-3">
                      <Ticker setCode={v.setCode} number={v.collectorNumber} />
                      <span className="num">
                        {formatMoney(m.from, currency)} → {formatMoney(m.to, currency)}
                      </span>
                    </span>
                  </span>
                  <span className="text-right text-sm">
                    <Delta amount={null} pct={m.changePct} className="font-medium" />
                    <span className="block">
                      <Delta amount={m.changeAmount} currency={currency} className="text-xs opacity-90" />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
