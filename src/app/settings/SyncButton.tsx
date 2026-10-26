"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui";
import { runCatalogSync, type ActionState } from "./actions";

export function SyncButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p role="status" className={cn("text-sm", result?.ok ? "text-gain" : "text-loss")}>
        {pending ? <span className="text-ink-3">Downloading from Riftcodex — about a minute…</span> : result?.message}
      </p>
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(await runCatalogSync());
          })
        }
      >
        <RefreshCw size={15} className={cn(pending && "animate-spin")} aria-hidden />
        {pending ? "Syncing…" : "Sync now"}
      </Button>
    </div>
  );
}
