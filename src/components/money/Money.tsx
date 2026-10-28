import { formatMoney, formatPct } from "@/lib/money/money";
import { SOURCE_LABEL } from "@/lib/domain/enums";
import { cn } from "@/lib/ui";

export function MoneyText({ amount, currency, className, compact }: { amount: number | null; currency: string; className?: string; compact?: boolean }) {
  if (amount == null) return <span className={cn("num text-ink-3", className)}>—</span>;
  return <span className={cn("num", className)}>{formatMoney(amount, currency, { compact })}</span>;
}

/** Gain/loss: always arrow + sign + colour, never colour alone (spec §7). */
export function Delta({
  amount,
  currency,
  pct,
  className,
  showAmount = true,
}: {
  amount: number | null;
  currency?: string;
  pct?: number | null;
  className?: string;
  showAmount?: boolean;
}) {
  if (amount == null && pct == null) return <span className={cn("num text-ink-3", className)}>—</span>;
  const v = amount ?? pct ?? 0;
  const dir = v > 0 ? "up" : v < 0 ? "down" : "flat";
  const tone = dir === "up" ? "text-gain" : dir === "down" ? "text-loss" : "text-ink-3";
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "■";
  return (
    <span className={cn("num inline-flex items-baseline gap-1 whitespace-nowrap", tone, className)}>
      <span aria-hidden className="text-[0.7em]">
        {arrow}
      </span>
      <span className="sr-only">{dir === "up" ? "up" : dir === "down" ? "down" : "unchanged"}</span>
      {showAmount && amount != null && currency && <span>{formatMoney(amount, currency, { sign: true })}</span>}
      {pct != null && <span className={showAmount && amount != null ? "opacity-80" : undefined}>{showAmount && amount != null ? `(${formatPct(pct)})` : formatPct(pct)}</span>}
    </span>
  );
}

const STAMP = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export function formatStamp(d: Date): string {
  return STAMP.format(d);
}

/** "TCGplayer market · 26 Oct, 03:05" — every price shows its source and when it was updated (spec §0.4). */
export function SourceStamp({ source, asOf, detail, className }: { source: string; asOf: Date; detail?: string; className?: string }) {
  return (
    <span className={cn("text-xs text-ink-3", className)}>
      {SOURCE_LABEL[source] ?? source}
      {detail && <> · {detail}</>} ·{" "}
      <time dateTime={asOf.toISOString()} className="num">
        {formatStamp(asOf)}
      </time>
    </span>
  );
}
