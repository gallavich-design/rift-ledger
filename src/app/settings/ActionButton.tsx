"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui";
import type { ActionState } from "./actions";

/** A button that runs a server action and reports the outcome inline. */
export function ActionButton({
  action,
  label,
  pendingLabel,
  pendingHint,
  variant = "secondary",
  icon,
  confirm,
}: {
  action: () => Promise<ActionState | void>;
  label: string;
  pendingLabel: string;
  pendingHint?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  icon?: "refresh";
  confirm?: string;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const run = () =>
    start(async () => {
      setConfirming(false);
      const r = await action();
      setResult(r ?? null);
    });
  return (
    <div className="flex flex-wrap items-center gap-3">
      {confirming ? (
        <>
          <span className="text-sm text-ink-2">{confirm}</span>
          <Button variant={variant} onClick={run}>
            {label}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button variant={variant} disabled={pending} onClick={() => (confirm ? setConfirming(true) : run())}>
          {icon === "refresh" && <RefreshCw size={15} className={cn(pending && "animate-spin")} aria-hidden />}
          {pending ? pendingLabel : label}
        </Button>
      )}
      <p role="status" className={cn("text-sm", result?.ok ? "text-gain" : "text-loss")}>
        {pending ? <span className="text-ink-3">{pendingHint}</span> : result?.message}
      </p>
    </div>
  );
}
