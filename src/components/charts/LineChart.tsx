"use client";

// Stock-style time-series chart (TradingView lightweight-charts). One y-axis, thin 2px lines,
// crosshair + tooltip on hover, legend always shown for ≥ 2 series, last-value labels on the axis.

import { useEffect, useMemo, useRef, useState } from "react";
import { ColorType, createChart, LineSeries, LineStyle, CrosshairMode, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";
import { formatMoney } from "@/lib/money/money";
import { addDays } from "@/config/app";
import { AXIS_TEXT, GRID_COLOR } from "@/config/chartColors";
import { cn } from "@/lib/ui";

export interface LineSeriesInput {
  id: string;
  name: string;
  color: string;
  dashed?: boolean;
  points: { day: string; value: number }[]; // value in minor units of `currency`
}

const RANGES = [
  { key: "1W", days: 7 },
  { key: "1M", days: 30 },
  { key: "3M", days: 91 },
  { key: "1Y", days: 365 },
  { key: "ALL", days: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

export function LineChart({
  series,
  currency,
  today,
  height = 280,
  defaultRange = "3M",
  ariaLabel,
  emptyText = "Not enough price history yet — it builds up as the daily price job runs.",
}: {
  series: LineSeriesInput[];
  currency: string;
  today: string;
  height?: number;
  defaultRange?: RangeKey;
  ariaLabel: string;
  emptyText?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const [range, setRange] = useState<RangeKey>(defaultRange);
  const [hover, setHover] = useState<{ day: string; x: number; values: { id: string; value: number }[] } | null>(null);

  const visible = useMemo(() => {
    const r = RANGES.find((x) => x.key === range)!;
    const from = r.days === Infinity ? "0000-00-00" : addDays(today, -r.days);
    return series.map((s) => ({ ...s, points: s.points.filter((p) => p.day >= from) })).filter((s) => s.points.length > 0);
  }, [series, range, today]);

  const pointCount = Math.max(0, ...visible.map((s) => s.points.length));

  useEffect(() => {
    if (!box.current) return;
    const chart = createChart(box.current, {
      height,
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: AXIS_TEXT, fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: GRID_COLOR } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true, lockVisibleTimeRangeOnResize: true },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: "rgba(22,24,29,0.25)", width: 1, style: LineStyle.Solid, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
      localization: { priceFormatter: (v: number) => formatMoney(Math.round(v * 100), currency, { compact: true }) },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setHover(null);
        return;
      }
      const values: { id: string; value: number }[] = [];
      for (const [id, s] of seriesRefs.current) {
        const d = param.seriesData.get(s) as { value?: number } | undefined;
        if (d?.value != null) values.push({ id, value: Math.round(d.value * 100) });
      }
      setHover({ day: String(param.time), x: param.point.x, values });
    });
    const refs = seriesRefs.current;
    return () => {
      chart.remove();
      chartRef.current = null;
      refs.clear();
    };
  }, [height, currency]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const s of seriesRefs.current.values()) chart.removeSeries(s);
    seriesRefs.current.clear();
    for (const s of visible) {
      const line = chart.addSeries(LineSeries, {
        color: s.color,
        lineWidth: 2,
        lineStyle: s.dashed ? LineStyle.Dashed : LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: true, // direct label on the axis (relief for low-contrast hues)
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: "#ffffff",
        crosshairMarkerBorderWidth: 2,
        pointMarkersVisible: s.points.length < 3, // a lone point needs a visible mark
        pointMarkersRadius: 4,
        title: "",
      });
      line.setData(s.points.map((p) => ({ time: p.day as Time, value: p.value / 100 })));
      seriesRefs.current.set(s.id, line);
    }
    chart.timeScale().fitContent();
  }, [visible]);

  const names = new Map(series.map((s) => [s.id, s]));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
          {series.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <svg width="16" height="8" aria-hidden>
                <line x1="0" y1="4" x2="16" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "4 3" : undefined} />
              </svg>
              {s.name}
            </li>
          ))}
        </ul>
        <div role="group" aria-label="Time range" className="inline-flex rounded-[var(--radius-control)] border border-rule bg-inset p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}
              className={cn("num h-7 rounded-[3px] px-2.5 text-[12px]", range === r.key ? "bg-sheet font-medium text-ink shadow-[0_0_0_1px_var(--rule)]" : "text-ink-3 hover:text-ink")}
            >
              {r.key}
            </button>
          ))}
        </div>
      </div>
      <div className="relative" style={{ height }}>
        <div ref={box} className="absolute inset-0" role="img" aria-label={ariaLabel} />
        {pointCount === 0 && <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-ink-3">{emptyText}</p>}
        {pointCount === 1 && (
          <p className="pointer-events-none absolute inset-x-0 top-1 text-center text-xs text-ink-3">One day of history so far — the line appears from the second day.</p>
        )}
        {hover && hover.values.length > 0 && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-[var(--radius-control)] border border-rule-strong bg-sheet px-3 py-2 text-xs shadow-[0_8px_24px_-10px_rgba(22,24,29,0.3)]"
            style={{ left: Math.min(Math.max(hover.x + 12, 0), (box.current?.clientWidth ?? 300) - 180) }}
          >
            <p className="num mb-1 text-ink-3">{hover.day}</p>
            {hover.values.map((v) => (
              <p key={v.id} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-ink-2">
                  <span className="inline-block h-0.5 w-3" style={{ background: names.get(v.id)?.color }} aria-hidden />
                  {names.get(v.id)?.name}
                </span>
                <span className="num font-medium text-ink">{formatMoney(v.value, currency)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      {/* Table view for screen readers and anyone who prefers numbers (relief rule) */}
      <details className="mt-2 text-xs text-ink-3">
        <summary className="cursor-pointer hover:text-ink">Show as table</summary>
        <div className="mt-2 max-h-56 overflow-auto rounded-[var(--radius-control)] border border-rule">
          <table className="num w-full text-right">
            <thead className="sticky top-0 bg-sheet">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Day</th>
                {visible.map((s) => (
                  <th key={s.id} className="px-3 py-1.5 font-medium">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...new Set(visible.flatMap((s) => s.points.map((p) => p.day)))]
                .sort()
                .reverse()
                .map((day) => (
                  <tr key={day} className="border-t border-rule-soft text-ink-2">
                    <td className="px-3 py-1 text-left">{day}</td>
                    {visible.map((s) => {
                      const p = s.points.find((x) => x.day === day);
                      return (
                        <td key={s.id} className="px-3 py-1">
                          {p ? formatMoney(p.value, currency) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
