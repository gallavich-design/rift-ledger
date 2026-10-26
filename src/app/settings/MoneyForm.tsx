"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Segmented, TextField } from "@/components/ui/fields";
import { CONDITIONS, CURRENCIES, SOURCE_LABEL, type Currency } from "@/lib/domain/enums";
import { cn } from "@/lib/ui";
import { saveMoneySettings } from "./actions";

export function MoneyForm({
  initial,
  sources,
  dailyRates,
}: {
  initial: { displayCurrency: string; defaultValuationSource: string; fxOverrides: Record<string, number>; conditionMultipliers: Record<string, number> };
  sources: string[];
  dailyRates: { quote: string; rateE6: number; day: string | null; source: string }[];
}) {
  const [currency, setCurrency] = useState<Currency>(initial.displayCurrency as Currency);
  const [source, setSource] = useState(initial.defaultValuationSource);
  const [fx, setFx] = useState({
    THB: initial.fxOverrides.THB ? String(initial.fxOverrides.THB / 1e6) : "",
    EUR: initial.fxOverrides.EUR ? String(initial.fxOverrides.EUR / 1e6) : "",
  });
  const [mult, setMult] = useState<Record<string, string>>(Object.fromEntries(CONDITIONS.map((c) => [c, String(initial.conditionMultipliers[c] ?? 100)])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      noValidate
      className="space-y-6 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const multipliers = Object.fromEntries(Object.entries(mult).map(([k, v]) => [k, Number(v)])) as Record<(typeof CONDITIONS)[number], number>;
        start(async () => {
          const r = await saveMoneySettings({ displayCurrency: currency, defaultValuationSource: source as "TCGPLAYER", fxTHB: fx.THB, fxEUR: fx.EUR, multipliers });
          setErrors(r.fieldErrors ?? {});
          setMsg({ ok: r.ok, text: r.message ?? "" });
        });
      }}
    >
      <div className="flex flex-wrap gap-6">
        <Segmented label="Show money in" name="display-currency" value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        <Segmented label="Value my collection at" name="valuation" value={source} onChange={setSource} options={sources.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))} />
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">Exchange rates</legend>
        <p className="mb-3 text-xs text-ink-3">Leave blank to use the daily rate. A value here overrides it until you clear it.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["THB", "EUR"] as const).map((q) => {
            const daily = dailyRates.find((r) => r.quote === q);
            return (
              <TextField
                key={q}
                label={`1 USD in ${q}`}
                inputMode="decimal"
                value={fx[q]}
                onChange={(e) => setFx((x) => ({ ...x, [q]: e.target.value }))}
                placeholder={daily ? (daily.rateE6 / 1e6).toFixed(4) : "no daily rate yet"}
                error={errors[`fx${q}`]}
                hint={daily?.day ? `Daily: ${(daily.rateE6 / 1e6).toFixed(4)} · ${daily.source}` : "Run the price job to fetch the daily rate."}
                className="num"
              />
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">Condition value</legend>
        <p className="mb-3 text-xs text-ink-3">Percent of the near-mint price a copy in each condition is worth.</p>
        <div className="grid grid-cols-5 gap-2 sm:max-w-md">
          {CONDITIONS.map((c) => (
            <TextField key={c} label={c} inputMode="numeric" value={mult[c]} onChange={(e) => setMult((m) => ({ ...m, [c]: e.target.value }))} error={errors[`multipliers.${c}`]} className="num" />
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {msg && (
          <p role="status" className={cn("text-sm", msg.ok ? "text-gain" : "text-loss")}>
            {msg.text}
          </p>
        )}
      </div>
    </form>
  );
}
