"use client";

import { Layers, Palette, Swords, Tag, Zap } from "lucide-react";
import type { CurveBucket, DeckStats } from "@/lib/decks/stats";
import { domainColor } from "@/config/domains";
import { cn } from "@/lib/ui";

// Curves and the domain bar are stacked in each domain's own colour (as on Piltover Archive, at the
// owner's request). Some domain pairs are close for colour-blind readers (Mind/Chaos, Body/Order), so
// colour is never the only cue: segments are separated by 2px gaps, every domain is named with its
// count in a chip, each bar's hover lists its split, and a screen-reader table carries the numbers.
// Card-type colours are the validated three-slot set (chartColors.ts); other types fold into a
// hatched, labelled "Other".
const TYPE_COLOR: Record<string, string> = { Unit: "#1f4fb5", Spell: "#eb6834", Gear: "#1baf7a" };
const OTHER_FILL = "repeating-linear-gradient(135deg, #8a8f98 0 3px, #c9ccd1 3px 6px)";
const TYPE_ORDER = ["Unit", "Spell", "Gear"];

export function DeckStatsPanel({ stats }: { stats: DeckStats }) {
  const known = stats.types.filter((t) => TYPE_ORDER.includes(t.key)).sort((a, b) => TYPE_ORDER.indexOf(a.key) - TYPE_ORDER.indexOf(b.key));
  const otherCount = stats.types.filter((t) => !TYPE_ORDER.includes(t.key)).reduce((a, t) => a + t.count, 0);
  const typeRows = [...known.map((t) => ({ key: t.key, count: t.count, fill: TYPE_COLOR[t.key] })), ...(otherCount ? [{ key: "Other", count: otherCount, fill: OTHER_FILL }] : [])];
  const domainRows = stats.domains.map((d) => ({ key: d.key, count: d.count, fill: domainColor(d.key).solid }));

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 overflow-hidden rounded-[var(--radius-control)] border border-rule" data-testid="stat-tiles">
        <Tile icon={<Layers size={16} aria-hidden />} label="Cards" value={String(stats.playables)} />
        <Tile icon={<Zap size={16} aria-hidden />} label="Avg energy" value={stats.averageEnergy?.toFixed(1) ?? "—"} />
        <Tile icon={<Swords size={16} aria-hidden />} label="Avg power" value={stats.averagePower?.toFixed(1) ?? "—"} />
      </dl>

      <Curve title="Energy curve" icon={<Zap size={15} aria-hidden />} unit="energy" buckets={stats.energyCurve} average={stats.averageEnergy} total={stats.playables} testid="energy-curve" />
      <Curve title="Power curve" icon={<Swords size={15} aria-hidden />} unit="power" buckets={stats.powerCurve} average={stats.averagePower} total={stats.playables} testid="power-curve" />

      <SplitCard
        title="Domains"
        icon={<Palette size={15} aria-hidden />}
        meta={`${domainRows.length} active`}
        rows={domainRows}
        testid="domains"
        note={domainRows.length > 1 && stats.domains.reduce((a, d) => a + d.count, 0) > stats.playables ? "Multi-domain cards count once for each domain." : undefined}
      />
      <SplitCard title="Card types" icon={<Tag size={15} aria-hidden />} meta={`${typeRows.length} ${typeRows.length === 1 ? "type" : "types"}`} rows={typeRows} testid="card-types" />
    </div>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 border-r border-rule py-3.5 last:border-r-0">
      <span className="text-ink-3">{icon}</span>
      <dd className="num text-[24px] leading-tight font-semibold text-ink">{value}</dd>
      <dt className="eyebrow text-[10px]">{label}</dt>
    </div>
  );
}

function CardHeader({ title, icon, meta, id }: { title: string; icon: React.ReactNode; meta: string; id: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="grid size-7 place-items-center rounded-[6px] border border-quill/25 bg-quill-tint text-quill">{icon}</span>
      <h3 id={id} className="text-sm font-semibold">
        {title}
      </h3>
      <span className="num ml-auto text-[11px] tracking-wide text-ink-3 uppercase">{meta}</span>
    </div>
  );
}

/** Round axis step so there are 2–4 gridlines. */
function niceStep(max: number) {
  for (const s of [1, 2, 5, 10, 20, 25, 50]) if (max / s <= 4) return s;
  return 100;
}

function Curve({ title, icon, unit, buckets, average, total, testid }: { title: string; icon: React.ReactNode; unit: string; buckets: CurveBucket[]; average: number | null; total: number; testid: string }) {
  const peak = Math.max(1, ...buckets.map((b) => b.count));
  const step = niceStep(peak);
  const top = Math.ceil(peak / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const H = 80;
  const px = (n: number) => (n / top) * H;

  return (
    <section className="rounded-[var(--radius-control)] border border-rule p-3" aria-labelledby={`${testid}-h`} data-testid={testid}>
      <CardHeader title={title} icon={icon} meta={`Avg ${average?.toFixed(1) ?? "—"}`} id={`${testid}-h`} />
      <div className="flex gap-1.5">
        {/* y axis */}
        <div className="relative w-5 shrink-0" style={{ height: H + 18 }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="num absolute right-0 text-[10px] leading-none text-ink-3" style={{ bottom: px(t) - 4 }}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height: H + 18 }}>
          {ticks.map((t) => (
            <span key={t} aria-hidden className={cn("absolute inset-x-0 h-px", t ? "bg-rule-soft" : "bg-rule")} style={{ bottom: px(t) }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[3px]" role="img" aria-label={`${title}: ${buckets.map((b) => `${b.count} at ${b.value}`).join(", ")}`}>
            {buckets.map((b) => {
              const barH = px(b.count);
              return (
                <div key={b.value} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                  {b.count > 0 && (
                    <span className="num mb-1 text-[11px] font-semibold text-ink" style={{ lineHeight: 1 }}>
                      {b.count}
                    </span>
                  )}
                  {/* stacked by domain, bottom-up; 2px gaps keep neighbouring colours apart */}
                  <div className="flex w-full max-w-[26px] flex-col-reverse gap-[2px]" style={{ height: barH }}>
                    {b.byDomain.map((d, i) => (
                      <div
                        key={d.domain}
                        className={cn("w-full group-hover:opacity-85", i === b.byDomain.length - 1 && "rounded-t-[4px]")}
                        style={{ flexGrow: d.count, flexBasis: 0, background: domainColor(d.domain).solid, minHeight: 2 }}
                      />
                    ))}
                  </div>
                  {b.count > 0 && (
                    <span style={{ bottom: barH + 20 }} className="pointer-events-none absolute z-10 hidden rounded-[4px] border border-rule bg-sheet px-2 py-1 text-[11px] whitespace-nowrap text-ink shadow-sm group-hover:block">
                      <span className="font-medium">
                        {b.count} at {b.value} {unit}
                      </span>{" "}
                      <span className="text-ink-3">· {total ? Math.round((b.count / total) * 100) : 0}%</span>
                      {b.byDomain.length > 1 && <span className="block text-ink-2">{b.byDomain.map((d) => `${d.domain} ${d.count}`).join(" · ")}</span>}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-1 flex gap-[3px] pl-[26px]">
        {buckets.map((b) => (
          <span key={b.value} className="num min-w-0 flex-1 text-center text-[11px] text-ink-3">
            {b.value}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>{unit}</th>
            <th>cards</th>
            <th>by domain</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.value}>
              <td>{b.value}</td>
              <td>{b.count}</td>
              <td>{b.byDomain.map((d) => `${d.domain} ${d.count}`).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SplitCard({ title, icon, meta, rows, testid, note }: { title: string; icon: React.ReactNode; meta: string; rows: { key: string; count: number; fill: string }[]; testid: string; note?: string }) {
  const sum = rows.reduce((a, r) => a + r.count, 0);
  return (
    <section className="rounded-[var(--radius-control)] border border-rule p-3" aria-labelledby={`${testid}-h`} data-testid={testid}>
      <CardHeader title={title} icon={icon} meta={meta} id={`${testid}-h`} />
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={rows.map((r) => `${r.key} ${r.count}`).join(", ")}>
        {rows.map((r) => (
          <div key={r.key} title={`${r.key}: ${r.count} (${sum ? Math.round((r.count / sum) * 100) : 0}%)`} style={{ flexGrow: r.count, background: r.fill }} />
        ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {rows.map((r) => (
          <li key={r.key} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-rule bg-inset px-2.5 text-xs">
            <span className="size-2.5 rounded-full" style={{ background: r.fill }} aria-hidden />
            <span className="text-ink">{r.key}</span>
            <span className="num text-ink-3">{r.count}</span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-2 text-[11px] text-ink-3">{note}</p>}
    </section>
  );
}
