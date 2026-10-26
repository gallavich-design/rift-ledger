"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function DataSection({ demo, hasData }: { demo: boolean; hasData: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/data/import", { method: "POST", body: await f.text(), headers: { "content-type": "application/json" } });
      const r = (await res.json()) as { ok: boolean; message?: string; summary?: { rows: Record<string, number>; prices: number } };
      if (r.ok && r.summary) {
        setMsg({ ok: true, text: `Imported ${r.summary.rows.lot ?? 0} lots, ${r.summary.rows.sale ?? 0} sales, ${r.summary.rows.sealedProduct ?? 0} sealed products, ${r.summary.rows.deck ?? 0} decks and ${r.summary.prices} price points.` });
        router.refresh();
      } else setMsg({ ok: false, text: r.message ?? "Import failed." });
    } catch {
      setMsg({ ok: false, text: "Import failed — couldn't reach the app." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const link = "inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-rule-strong bg-sheet px-4 text-sm font-medium hover:bg-hover";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4">
        <p className="w-full text-sm text-ink-2 sm:w-auto sm:flex-1">Everything you entered, plus the cards and price history it needs.</p>
        <a href="/api/data/export?format=json" className={link} data-testid="export-json">
          <Download size={15} aria-hidden /> Export all (JSON)
        </a>
        <a href="/api/data/export?format=lots" className={link}>
          Lots CSV
        </a>
        <a href="/api/data/export?format=sales" className={link}>
          Sales CSV
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4">
        <p className="w-full text-sm text-ink-2 sm:w-auto sm:flex-1">
          Restore an export into this app. {demo ? "Exit demo mode first." : hasData ? "Your collection must be empty, so nothing is mixed or duplicated." : "Your collection is empty, so it's ready."}
        </p>
        <input ref={input} type="file" accept="application/json,.json" className="sr-only" id="import-file" onChange={(e) => onFile(e.target.files?.[0])} disabled={busy || demo} aria-label="Import file" />
        <Button variant="secondary" disabled={busy || demo || hasData} onClick={() => input.current?.click()}>
          <Upload size={15} aria-hidden /> {busy ? "Importing…" : "Import JSON"}
        </Button>
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={`w-full text-sm ${msg.ok ? "text-gain" : "text-loss"}`} data-testid="import-result">
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
