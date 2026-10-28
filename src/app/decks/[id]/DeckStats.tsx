"use client";

import { Layers, Swords, Zap } from "lucide-react";
import type { CurveBucket, DeckStats } from "@/lib/decks/stats";
import { DomainChip } from "@/components/cards/bits";
import { cn } from "@/lib/ui";

// Card-type colours: the validated three-slot categorical set (chartColors.ts: all pairs pass CVD +
// normal-vision checks on white). Anything beyond Unit/Spell/Gear folds into a hatched neutral "Other",
// labelled, so identity never rests on colour alone. Domains are shown with their chips and counts
// rather than stacked by domain colour: several domain pairs (Mind/Chaos, Body/Order) fail the
// colour-vision checks as chart fills.
const TYPE_COLOR: Record<string, string> = {
  Unit: "#1f4fb5",
  Spell: "#eb6834",
  Gear: "#1baf7a",
};
const OTHER_FILL =
  "repeating-linear-gradient(135deg, #8a8f98 0 3px, #c9ccd1 3px 6px)";
const BAR = "#1f4fb5";

export function DeckStatsPanel({ stats }: { stats: DeckStats }) {
  const typeOrder = ["Unit", "Spell", "Gear"];
  const known = stats.types
    .filter((t) => typeOrder.includes(t.key))
    .sort((a, b) => typeOrder.indexOf(a.key) - typeOrder.indexOf(b.key));
  const otherCount = stats.types
    .filter((t) => !typeOrder.includes(t.key))
    .reduce((a, t) => a + t.count, 0);
  const typeRows = [
    ...known.map((t) => ({
      key: t.key,
      count: t.count,
      fill: TYPE_COLOR[t.key],
    })),
    ...(otherCount
      ? [{ key: "Other", count: otherCount, fill: OTHER_FILL }]
      : []),
  ];
  const pct = (n: number) =>
    stats.playables ? Math.round((n / stats.playables) * 100) : 0;

  return (
    <div className="space-y-3">
      <dl
        className="grid grid-cols-3 overflow-hidden rounded-[var(--radius-control)] border border-rule"
        data-testid="stat-tiles"
      >
        <Tile
          icon={<Layers size={15} aria-hidden />}
          label="Cards"
          value={String(stats.playables)}
        />
        <Tile
          icon={<Zap size={15} aria-hidden />}
          label="Avg energy"
          value={stats.averageEnergy?.toFixed(1) ?? "—"}
        />
        <Tile
          icon={<Swords size={15} aria-hidden />}
          label="Avg power"
          value={stats.averagePower?.toFixed(1) ?? "—"}
        />
      </dl>

      <Curve
        title="Energy curve"
        icon={<Zap size={14} aria-hidden />}
        unit="energy"
        buckets={stats.energyCurve}
        average={stats.averageEnergy}
        total={stats.playables}
        testid="energy-curve"
      />
      <Curve
        title="Power curve"
        icon={<Swords size={14} aria-hidden />}
        unit="power"
        buckets={stats.powerCurve}
        average={stats.averagePower}
        total={stats.playables}
        testid="power-curve"
      />

      <section
        className="rounded-[var(--radius-control)] border border-rule p-3"
        aria-labelledby="types-h"
        data-testid="card-types"
      >
        <h3 id="types-h" className="mb-2 text-sm font-semibold">
          Card types
        </h3>
        <div
          className="flex h-2.5 gap-[2px] overflow-hidden rounded-full"
          role="img"
          aria-label={typeRows.map((r) => `${r.key} ${r.count}`).join(", ")}
        >
          {typeRows.map((r) => (
            <div
              key={r.key}
              title={`${r.key}: ${r.count} (${pct(r.count)}%)`}
              style={{ flexGrow: r.count, background: r.fill }}
            />
          ))}
        </div>
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {typeRows.map((r) => (
            <li key={r.key} className="flex items-center gap-1.5">
              <span
                className="size-2.5 shrink-0 rounded-[2px]"
                style={{ background: r.fill }}
                aria-hidden
              />
              <span className="text-ink-2">{r.key}</span>
              <span className="num ml-auto text-ink">{r.count}</span>
              <span className="num w-9 text-right text-ink-3">
                {pct(r.count)}%
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="rounded-[var(--radius-control)] border border-rule p-3"
        aria-labelledby="domains-h"
      >
        <h3 id="domains-h" className="mb-2 text-sm font-semibold">
          Domains
        </h3>
        <ul className="space-y-1.5 text-xs">
          {stats.domains.map((d) => (
            <li
              key={d.key}
              className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2"
            >
              <DomainChip name={d.key} />
              <span className="h-1.5 rounded-full bg-inset">
                <span
                  className="block h-1.5 rounded-full bg-ink-3"
                  style={{ width: `${pct(d.count)}%` }}
                />
              </span>
              <span className="num text-ink-2">{d.count}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-[11px] text-ink-3">
          Multi-domain cards count once for each domain.
        </p>
      </section>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 border-r border-rule py-3 last:border-r-0">
      <span className="text-ink-3">{icon}</span>
      <dd className="num text-[22px] leading-tight font-semibold text-ink">
        {value}
      </dd>
      <dt className="eyebrow text-[10px]">{label}</dt>
    </div>
  );
}

function Curve({
  title,
  icon,
  unit,
  buckets,
  average,
  total,
  testid,
}: {
  title: string;
  icon: React.ReactNode;
  unit: string;
  buckets: CurveBucket[];
  average: number | null;
  total: number;
  testid: string;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const H = 72;
  return (
    <section
      className="rounded-[var(--radius-control)] border border-rule p-3"
      aria-labelledby={`${testid}-h`}
      data-testid={testid}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-[4px] border border-rule text-ink-2">
          {icon}
        </span>
        <h3 id={`${testid}-h`} className="text-sm font-semibold">
          {title}
        </h3>
        <span className="num ml-auto text-[11px] text-ink-3">
          AVG {average?.toFixed(1) ?? "—"}
        </span>
      </div>
      <div
        className="flex items-end gap-[2px]"
        style={{ height: H + 16 }}
        role="img"
        aria-label={`${title}: ${buckets.map((b) => `${b.count} at ${b.value}`).join(", ")}`}
      >
        {buckets.map((b) => {
          const barH = b.count
            ? Math.max(3, Math.round((b.count / max) * H))
            : 0;
          return (
            <div
              key={b.value}
              className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            >
              <span
                className={cn(
                  "num mb-0.5 text-[10px] text-ink-2",
                  !b.count && "invisible",
                )}
              >
                {b.count}
              </span>
              <div
                className="w-full max-w-[22px] rounded-t-[3px] group-hover:opacity-80"
                style={{ height: barH, background: BAR }}
              />
              {b.count > 0 && (
                <span
                  style={{ bottom: barH + 18 }}
                  className="pointer-events-none absolute z-10 hidden rounded-[4px] border border-rule bg-sheet px-2 py-1 text-[11px] whitespace-nowrap text-ink shadow-sm group-hover:block"
                >
                  <span className="num">{b.count}</span>{" "}
                  {b.count === 1 ? "card" : "cards"} at {b.value} {unit} ·{" "}
                  <span className="num">
                    {total ? Math.round((b.count / total) * 100) : 0}%
                  </span>
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-[2px] border-t border-rule pt-1">
        {buckets.map((b) => (
          <span
            key={b.value}
            className="num min-w-0 flex-1 text-center text-[10px] text-ink-3"
          >
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
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.value}>
              <td>{b.value}</td>
              <td>{b.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
