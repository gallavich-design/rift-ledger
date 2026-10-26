import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { loadReport } from "@/lib/reports/load";
import { SOURCE_LABEL, SOURCE_SHORT } from "@/lib/domain/enums";
import { formatMoney } from "@/lib/money/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FxMissing } from "@/components/money/FxMissing";
import { Delta, MoneyText, formatStamp } from "@/components/money/Money";
import { cn } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const sp = await searchParams;
  const { sources, source, report: r } = await loadReport(sp.source);
  const q = `source=${source}`;
  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Reports"
        description="A collection value report for insurance, a sale, or your own records."
        actions={
          sources.length > 1 ? (
            <div role="group" aria-label="Valuation source" className="inline-flex rounded-[var(--radius-control)] border border-rule bg-inset p-0.5 text-[13px]">
              {sources.map((s) => (
                <Link key={s} href={`/reports?source=${s}`} aria-current={s === source ? "true" : undefined} title={SOURCE_LABEL[s]} className={cn("inline-flex h-8 items-center rounded-[3px] px-3", s === source ? "bg-sheet font-medium text-ink shadow-[0_0_0_1px_var(--rule)]" : "text-ink-3 hover:text-ink")}>
                  {SOURCE_SHORT[s]}
                </Link>
              ))}
            </div>
          ) : undefined
        }
      />
      {!r ? (
        <FxMissing />
      ) : r.cards.length === 0 && r.sealed.length === 0 ? (
        <EmptyState title="Nothing to report yet" body="Add cards or sealed product and the value report fills in." action={{ href: "/collection/add", label: "Add purchase" }} />
      ) : (
        <>
          <section className="rounded-[var(--radius-panel)] border border-rule bg-sheet p-4 sm:p-5" aria-labelledby="vr-h">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id="vr-h" className="eyebrow">
                  Collection value report
                </h2>
                <p className="num mt-1 text-[32px] leading-none font-medium tracking-[-0.02em]" data-testid="report-total">
                  {formatMoney(r.totals.value, r.display)}
                </p>
                <p className="mt-2 text-xs text-ink-3">
                  {r.sourceLabel}
                  {r.latestPriceAt && <> · prices updated <span className="num">{formatStamp(r.latestPriceAt)}</span></>} · same total as the dashboard for this source
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={`/api/reports/value?format=pdf&${q}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] bg-quill px-4 text-sm font-medium text-quill-ink hover:bg-quill/90" data-testid="report-pdf">
                  <FileText size={15} aria-hidden /> Open PDF
                </a>
                <a href={`/api/reports/value?format=csv&${q}`} className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-rule-strong bg-sheet px-4 text-sm font-medium hover:bg-hover" data-testid="report-csv">
                  <Download size={15} aria-hidden /> CSV
                </a>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-control)] border border-rule bg-rule sm:grid-cols-4">
              {[
                ["Cards", <MoneyText key="c" amount={r.totals.cardsValue} currency={r.display} />],
                ["Sealed", <MoneyText key="s" amount={r.totals.sealedValue} currency={r.display} />],
                ["Cost basis", <MoneyText key="b" amount={r.totals.cost} currency={r.display} />],
                ["Unrealized", <Delta key="u" amount={r.totals.unrealized} currency={r.display} pct={r.totals.unrealizedPct} />],
              ].map(([k, v]) => (
                <div key={k as string} className="bg-sheet px-3 py-2.5">
                  <dt className="eyebrow">{k}</dt>
                  <dd className="mt-1 text-[15px] font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-ink-3">
              The PDF has totals by set, your {r.top.length} most valuable cards with images, graded cards ({r.graded.length}) and sealed products ({r.sealed.length}). The CSV lists every position with its price source and update time.
            </p>
          </section>

          <section className="mt-6" aria-labelledby="bs-h">
            <h2 id="bs-h" className="mb-3 text-base font-semibold">
              By set
            </h2>
            <div className="overflow-x-auto rounded-[var(--radius-panel)] border border-rule bg-sheet">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="eyebrow border-b border-rule text-left">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Set</th>
                    <th className="px-3 py-2.5 text-right font-medium">Copies</th>
                    <th className="px-3 py-2.5 text-right font-medium">Value</th>
                    <th className="px-4 py-2.5 text-right font-medium">Cost basis</th>
                  </tr>
                </thead>
                <tbody>
                  {r.bySet.map((s) => (
                    <tr key={s.setCode} className="border-b border-rule-soft last:border-b-0">
                      <td className="px-4 py-2">
                        <span className="num text-ink-3">{s.setCode}</span> {s.setName}
                      </td>
                      <td className="num px-3 py-2 text-right">{s.copies}</td>
                      <td className="num px-3 py-2 text-right">{formatMoney(s.value, r.display)}</td>
                      <td className="num px-4 py-2 text-right">{formatMoney(s.cost, r.display)}</td>
                    </tr>
                  ))}
                  {r.sealed.length > 0 && (
                    <tr className="border-b border-rule-soft">
                      <td className="px-4 py-2">Sealed product</td>
                      <td className="num px-3 py-2 text-right">{r.sealed.reduce((a, s) => a + s.quantity, 0)}</td>
                      <td className="num px-3 py-2 text-right">{formatMoney(r.totals.sealedValue, r.display)}</td>
                      <td className="num px-4 py-2 text-right">{formatMoney(r.totals.sealedCost, r.display)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <p className="mt-6 text-xs text-ink-3">
            Need everything, not just values?{" "}
            <Link href="/settings#data" className="text-quill hover:underline">
              Export all your data
            </Link>{" "}
            from Settings.
          </p>
        </>
      )}
    </div>
  );
}
