"use client";

// Horizontal magnitude bars (Recharts). One hue — the label on each bar carries identity,
// so domain/rarity names are never encoded by colour alone.

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/money/money";
import { AXIS_TEXT, BAR_COLOR } from "@/config/chartColors";

export function BreakdownBars({
  title,
  rows,
  currency,
  total,
  colors,
}: {
  title: string;
  rows: { key: string; value: number }[];
  currency: string;
  total: number;
  colors?: Record<string, string>; // optional per-entity accent (e.g. domains); labels still carry identity
}) {
  const top = rows.slice(0, 6);
  const rest = rows.slice(6).reduce((a, r) => a + r.value, 0);
  const data = [...top, ...(rest > 0 ? [{ key: "Other", value: rest }] : [])].map((r) => ({
    ...r,
    major: r.value / 100,
    pct: total ? (r.value / total) * 100 : 0,
  }));
  const height = data.length * 34 + 8;

  return (
    <figure className="rounded-[var(--radius-panel)] border border-rule bg-sheet p-4">
      <figcaption className="eyebrow mb-3">{title}</figcaption>
      {data.length === 0 ? (
        <p className="py-4 text-sm text-ink-3">No priced cards yet.</p>
      ) : (
        <>
          <div style={{ height }} role="img" aria-label={`${title}: ${data.map((d) => `${d.key} ${d.pct.toFixed(0)}%`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap={8}>
                <XAxis type="number" hide domain={[0, "dataMax"]} />
                <YAxis
                  type="category"
                  dataKey="key"
                  width={92}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: AXIS_TEXT, fontSize: 12, fontFamily: "var(--font-plex-sans)" }}
                  tickFormatter={(v: string) => (v.length > 13 ? v.slice(0, 12) + "…" : v)}
                />
                <Tooltip
                  cursor={{ fill: "rgba(22,24,29,0.04)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof data)[number];
                    return (
                      <div className="rounded-[var(--radius-control)] border border-rule-strong bg-sheet px-3 py-2 text-xs shadow-[0_8px_24px_-10px_rgba(22,24,29,0.3)]">
                        <p className="font-medium text-ink">{d.key}</p>
                        <p className="num text-ink-2">
                          {formatMoney(d.value, currency)} · {d.pct.toFixed(1)}%
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="major" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
                  {data.map((d) => (
                    <Cell key={d.key} fill={colors?.[d.key] ?? BAR_COLOR} />
                  ))}
                  <LabelList
                    dataKey="pct"
                    position="right"
                    formatter={(v: unknown) => `${Number(v).toFixed(0)}%`}
                    style={{ fill: AXIS_TEXT, fontSize: 11, fontFamily: "var(--font-plex-mono)" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </figure>
  );
}
