"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileUp } from "lucide-react";
import { Segmented, TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/money/money";
import { CURRENCIES, type Currency } from "@/lib/domain/enums";
import { cn } from "@/lib/ui";
import { commitImport, previewImport, type PreviewRow } from "./actions";

const STATUS: Record<PreviewRow["status"], { label: string; cls: string }> = {
  exact: { label: "Matched", cls: "bg-gain-tint text-gain" },
  chosen: { label: "Matched · check printing", cls: "bg-caution-tint text-caution" },
  fuzzy: { label: "Best guess", cls: "bg-caution-tint text-caution" },
  missing: { label: "Not found", cls: "bg-loss-tint text-loss" },
  invalid: { label: "Fix row", cls: "bg-loss-tint text-loss" },
};

const EXAMPLE = `3 Jinx - Rebel
2x Mirror Image
OGN-202 foil
1 Ahri - Alluring (PR)`;

export function ImportForm({ today, defaultCurrency }: { today: string; defaultCurrency: Currency }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);
  const [acquiredOn, setAcquiredOn] = useState(today);
  const [seller, setSeller] = useState("");
  const [missingPrice, setMissingPrice] = useState<"market" | "zero">("market");
  const [preview, setPreview] = useState<{ kind: string; unknownColumns: string[]; rows: PreviewRow[] } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const defaults = { currency, acquiredOn, seller, missingPrice };

  const runPreview = (t = text) =>
    start(async () => {
      setMsg(null);
      const r = await previewImport(t, defaults);
      if (r.ok) setPreview(r.data);
      else {
        setPreview(null);
        setMsg({ ok: false, text: r.message });
      }
    });

  const runImport = () =>
    start(async () => {
      const r = await commitImport(text, defaults);
      if (r.ok) {
        setMsg({ ok: true, text: `Imported ${r.data.cards} cards in ${r.data.lots} lines (${r.data.orders} order${r.data.orders === 1 ? "" : "s"})${r.data.skipped ? `; ${r.data.skipped} rows skipped` : ""}.` });
        setPreview(null);
        setText("");
        setFileName(null);
        router.refresh();
      } else setMsg({ ok: false, text: r.message });
    });

  const ok = preview?.rows.filter((r) => r.importable) ?? [];
  const totalBy = new Map<string, number>();
  for (const r of ok) totalBy.set(r.currencyUsed, (totalBy.get(r.currencyUsed) ?? 0) + (r.landedTotal ?? (r.unitCost ?? 0) * r.quantity));

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[var(--radius-panel)] border border-rule bg-sheet p-4 sm:p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="import-text" className="text-sm font-medium">
              Paste a list or CSV
            </label>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border border-rule-strong bg-sheet px-2.5 text-[13px] font-medium hover:bg-hover">
                <FileUp size={14} aria-hidden /> {fileName ?? "Choose CSV file"}
                <input
                  type="file"
                  accept=".csv,text/csv,.txt,text/plain"
                  className="sr-only"
                  data-testid="import-file"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const t = await f.text();
                    setText(t);
                    setFileName(f.name);
                    runPreview(t);
                  }}
                />
              </label>
              <a href="/api/import-template" className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 text-[13px] text-quill hover:bg-hover">
                <Download size={14} aria-hidden /> Template
              </a>
            </div>
          </div>
          <textarea
            id="import-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
            }}
            rows={10}
            spellCheck={false}
            placeholder={EXAMPLE}
            className="num w-full rounded-[var(--radius-control)] border border-rule bg-inset px-3 py-2 text-[13px] leading-relaxed placeholder:text-ink-4 focus:border-quill focus:bg-sheet focus:outline-none"
          />
          <p className="mt-2 text-xs text-ink-3">
            One card per line (&ldquo;3 Jinx - Rebel&rdquo;, &ldquo;OGN-202 foil&rdquo;), or a CSV with a header row. CSV columns: name or set + number, then optional finish, printing, condition, quantity,
            unit_price, currency, acquired_on, seller, storage, notes. A Rift Ledger lots export imports as-is.
          </p>
        </div>
        <div className="space-y-4 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4 sm:p-5">
          <p className="eyebrow">For rows that don&rsquo;t say</p>
          <TextField label="Bought on" type="date" value={acquiredOn} max={today} onChange={(e) => setAcquiredOn(e.target.value)} />
          <Segmented label="Currency" name="imp-cur" value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          <TextField label="Bought from" optional value={seller} onChange={(e) => setSeller(e.target.value)} placeholder="Imported" />
          <Segmented
            label="No price given"
            name="imp-missing"
            value={missingPrice}
            onChange={setMissingPrice}
            options={[
              { value: "market", label: "Use market price" },
              { value: "zero", label: "Cost 0" },
            ]}
          />
          <Button className="w-full" variant="secondary" onClick={() => runPreview()} disabled={pending || !text.trim()}>
            {pending && !preview ? "Matching…" : "Preview"}
          </Button>
        </div>
      </section>

      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={cn("rounded-[var(--radius-panel)] border px-4 py-2.5 text-sm", msg.ok ? "border-gain/30 bg-gain-tint text-gain" : "border-loss/30 bg-loss-tint text-loss")} data-testid="import-message">
          {msg.text}
        </p>
      )}

      {preview && (
        <section aria-labelledby="pv-h">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="pv-h" className="text-base font-semibold">
              Preview{" "}
              <span className="text-sm font-normal text-ink-3" data-testid="import-summary">
                · {ok.length} of {preview.rows.length} rows ready · {ok.reduce((a, r) => a + r.quantity, 0)} cards · cost{" "}
                {[...totalBy].map(([c, v]) => formatMoney(v, c)).join(" + ") || "—"}
              </span>
            </h2>
            <Button onClick={runImport} disabled={pending || !ok.length}>
              {pending ? "Importing…" : `Import ${ok.length} row${ok.length === 1 ? "" : "s"}`}
            </Button>
          </div>
          {preview.unknownColumns.length > 0 && <p className="mb-2 text-xs text-caution">Ignored columns: {preview.unknownColumns.join(", ")}</p>}
          <div className="overflow-x-auto rounded-[var(--radius-panel)] border border-rule bg-sheet">
            <table className="w-full min-w-[720px] text-sm" data-testid="import-preview">
              <thead className="eyebrow border-b border-rule text-left">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Line</th>
                  <th className="px-3 py-2.5 font-medium">You wrote</th>
                  <th className="px-3 py-2.5 font-medium">Matched printing</th>
                  <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                  <th className="px-3 py-2.5 text-right font-medium">Cost each</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line} className="border-b border-rule-soft align-top last:border-b-0" data-status={r.status}>
                    <td className="num px-3 py-2 text-ink-3">{r.line}</td>
                    <td className="px-3 py-2">
                      {r.name ?? ""} {r.setCode ? <span className="num text-ink-3">{`${r.setCode}${r.number != null ? `·${r.number}` : ""}`}</span> : null}
                      {r.finish === "FOIL" && <span className="text-ink-3"> foil</span>}
                      <span className="block text-xs text-ink-3">
                        {r.condition} · {r.dateUsed}
                        {r.seller ? ` · ${r.seller}` : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn("inline-block rounded-[3px] px-1.5 py-0.5 text-[11px] font-medium", STATUS[r.status].cls)}>{STATUS[r.status].label}</span>
                      {r.label && <span className="num mt-1 block text-xs">{r.label}</span>}
                      {r.note && <span className="mt-0.5 block text-xs text-ink-3">{r.note}</span>}
                    </td>
                    <td className="num px-3 py-2 text-right">{r.quantity}</td>
                    <td className="num px-3 py-2 text-right">
                      {r.unitCost != null ? formatMoney(r.unitCost, r.currencyUsed) : "—"}
                      {r.costFrom === "market" && <span className="block text-[11px] text-ink-3">market</span>}
                      {r.costFrom === "zero" && <span className="block text-[11px] text-caution">no price</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
