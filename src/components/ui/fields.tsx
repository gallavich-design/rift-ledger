"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/ui";

const CURRENCY_SYMBOL: Record<string, string> = { THB: "฿", USD: "$", EUR: "€" };

export const controlClass =
  "h-10 w-full rounded-[var(--radius-control)] border bg-inset px-3 text-[15px] placeholder:text-ink-4 hover:border-rule-strong focus:border-quill focus:bg-sheet focus:outline-none disabled:opacity-60";

interface FieldShell {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  optional?: boolean;
  hideLabel?: boolean;
}

function Shell({ id, label, error, hint, className, optional, hideLabel, children }: FieldShell & { id: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className={cn("mb-1.5 block text-sm font-medium", hideLabel && "sr-only")}>
        {label} {optional && <span className="font-normal text-ink-3">(optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-sm text-loss">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1 text-xs text-ink-3">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & FieldShell;

export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField(
  { label, error, hint, className, optional, hideLabel, ...props },
  ref,
) {
  const auto = useId();
  const id = props.id ?? auto;
  return (
    <Shell id={id} label={label} error={error} hint={hint} className={className} optional={optional} hideLabel={hideLabel}>
      <input
        ref={ref}
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        {...props}
        className={cn(controlClass, error ? "border-loss" : "border-rule")}
      />
    </Shell>
  );
});

/** Decimal money input. Value is the raw string; parse with parseMoneyInput. */
export function MoneyField({ currency, value, onChange, ...rest }: Omit<InputProps, "value" | "onChange"> & { currency: string; value: string; onChange: (v: string) => void }) {
  const auto = useId();
  const id = rest.id ?? auto;
  const { label, error, hint, className, optional, hideLabel, ...props } = rest;
  return (
    <Shell id={id} label={label} error={error} hint={hint} className={className} optional={optional} hideLabel={hideLabel}>
      <div className="relative">
        <span className="num pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-ink-3" aria-hidden>
          {CURRENCY_SYMBOL[currency] ?? currency}
        </span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          placeholder="0.00"
          {...props}
          className={cn(controlClass, "num pl-7 text-right", error ? "border-loss" : "border-rule")}
        />
      </div>
    </Shell>
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & FieldShell & { options: { value: string; label: string }[] };

export function SelectField({ label, error, hint, className, optional, hideLabel, options, ...props }: SelectProps) {
  const auto = useId();
  const id = props.id ?? auto;
  return (
    <Shell id={id} label={label} error={error} hint={hint} className={className} optional={optional} hideLabel={hideLabel}>
      <select id={id} aria-invalid={!!error} {...props} className={cn(controlClass, "pr-8", error ? "border-loss" : "border-rule")}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Shell>
  );
}

/** Segmented single choice (radio group styled as chips). */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  name,
  hideLabel,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  name: string;
  hideLabel?: boolean;
}) {
  return (
    <fieldset>
      <legend className={cn("mb-1.5 text-sm font-medium", hideLabel && "sr-only")}>{label}</legend>
      <div className="inline-flex rounded-[var(--radius-control)] border border-rule bg-inset p-0.5">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="peer sr-only" />
            <span className="num inline-flex h-8 items-center rounded-[3px] px-3 text-[13px] text-ink-2 peer-checked:bg-sheet peer-checked:font-medium peer-checked:text-ink peer-checked:shadow-[0_0_0_1px_var(--rule)] peer-focus-visible:outline-2 peer-focus-visible:outline-quill">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
