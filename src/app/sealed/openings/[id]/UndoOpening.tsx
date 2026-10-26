"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { undoOpening } from "@/app/sealed/actions";

export function UndoOpening({ id, back }: { id: string; back: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="rounded-[var(--radius-panel)] border border-rule bg-sheet p-4">
      {confirm ? (
        <div className="space-y-2 text-sm">
          <p>Remove these pulls from your collection and put the product back as sealed?</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await undoOpening(id);
                  if (r.ok) router.push(back);
                  else setErr(r.message);
                })
              }
            >
              Undo opening
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              Keep
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
          Undo this opening
        </Button>
      )}
      {err && (
        <p role="alert" className="mt-2 text-xs text-loss">
          {err}
        </p>
      )}
    </div>
  );
}
