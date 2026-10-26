"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Link2, Trash2 } from "lucide-react";
import { VariantPicker, variantLabel } from "@/components/cards/VariantPicker";
import { Button } from "@/components/ui/Button";
import { SourceStamp } from "@/components/money/Money";
import { formatMoney } from "@/lib/money/money";
import type { TradeRow } from "@/lib/trade/lists";
import { addTradeItem, setTradeItemQty, setTradeSharing } from "../actions";

export function ListsEditor({ haves, wants, currency, shareUrl }: { haves: TradeRow[]; wants: TradeRow[]; currency: string; source: string; shareUrl: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? null : (r.message ?? "Something went wrong"));
      router.refresh();
    });

  const list = (kind: "HAVE" | "WANT", rows: TradeRow[], title: string, hint: string) => {
    const total = rows.reduce((a, r) => a + (r.quote ? r.quote.unit * r.quantity : 0), 0);
    return (
      <section aria-labelledby={`${kind}-h`} className="min-w-0 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4" data-testid={`list-${kind}`}>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 id={`${kind}-h`} className="text-base font-semibold">
            {title} <span className="num text-sm font-normal text-ink-3">· {rows.reduce((a, r) => a + r.quantity, 0)}</span>
          </h2>
          <span className="num text-sm">{formatMoney(total, currency)}</span>
        </div>
        <VariantPicker value={null} onChange={(v) => v && run(() => addTradeItem({ kind, variantId: v.id, quantity: 1 }))} label={hint} resetOnPick />
        {rows.length === 0 ? (
          <p className="mt-4 text-center text-sm text-ink-3">Nothing listed yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-rule-soft border-t border-rule-soft">
            {rows.map((r) => (
              <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.variant.name}</p>
                  <p className="num truncate text-xs text-ink-3">
                    {variantLabel(r.variant)}
                    {kind === "HAVE" && <span className={r.owned < r.quantity ? "text-caution" : undefined}> · you own {r.owned}</span>}
                  </p>
                  <p className="text-xs">
                    <span className="num">{r.quote ? formatMoney(r.quote.unit, currency) : "—"}</span> <span className="text-ink-3">each</span>{" "}
                    {r.quote && <SourceStamp source={r.quote.source} asOf={new Date(r.quote.asOf)} />}
                  </p>
                </div>
                <div className="flex items-center gap-1" role="group" aria-label={`Quantity of ${r.variant.name}`}>
                  <Button size="sm" variant="ghost" aria-label="One fewer" onClick={() => run(() => setTradeItemQty(r.id, r.quantity - 1))} disabled={pending}>
                    −
                  </Button>
                  <span className="num w-6 text-center text-sm">{r.quantity}</span>
                  <Button size="sm" variant="ghost" aria-label="One more" onClick={() => run(() => setTradeItemQty(r.id, r.quantity + 1))} disabled={pending}>
                    +
                  </Button>
                </div>
                <Button size="sm" variant="ghost" aria-label={`Remove ${r.variant.name}`} onClick={() => run(() => setTradeItemQty(r.id, 0))} disabled={pending}>
                  <Trash2 size={14} aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-3 rounded-[var(--radius-panel)] border border-rule bg-sheet px-4 py-3" aria-label="Sharing">
        <Link2 size={16} aria-hidden className="text-ink-3" />
        {shareUrl ? (
          <>
            <a href={shareUrl} target="_blank" rel="noreferrer" className="num min-w-0 flex-1 truncate text-sm text-quill hover:underline" data-testid="trade-share-url">
              {shareUrl}
            </a>
            <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(shareUrl).then(() => setMsg("Link copied."))}>
              <Copy size={14} aria-hidden /> Copy
            </Button>
            <Button size="sm" variant="ghost" onClick={() => run(() => setTradeSharing(false))} disabled={pending}>
              Stop sharing
            </Button>
          </>
        ) : (
          <>
            <p className="min-w-0 flex-1 text-sm text-ink-2">Share a read-only page of both lists — names, printings, quantities and market prices. Nothing else from your collection.</p>
            <Button size="sm" onClick={() => run(() => setTradeSharing(true))} disabled={pending}>
              Create share link
            </Button>
          </>
        )}
      </section>
      {msg && (
        <p role="status" className="text-sm text-ink-2">
          {msg}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {list("HAVE", haves, "Haves", "Add a card you'd trade")}
        {list("WANT", wants, "Wants", "Add a card you're after")}
      </div>
    </div>
  );
}
