"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { undoAdded } from "@/app/collection/actions";

/** "Added 3 × Jinx to OGN. Undo" — Undo takes back exactly the copies just added. */
export function AddedResult({ text, lotIds, testid }: { text: string; lotIds: string[]; testid: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  if (done)
    return (
      <p role="status" className="basis-full text-sm text-ink-2" data-testid={testid}>
        {done}
      </p>
    );
  return (
    <p role="status" className="basis-full text-sm text-gain" data-testid={testid}>
      {text}{" "}
      {lotIds.length > 0 && (
        <button
          type="button"
          disabled={pending}
          className="text-quill hover:underline disabled:opacity-50"
          onClick={() =>
            start(async () => {
              const r = await undoAdded(lotIds);
              setDone(r.ok ? (r.message ?? "Undone.") : r.message);
              router.refresh();
            })
          }
        >
          {pending ? "Undoing…" : "Undo"}
        </button>
      )}
    </p>
  );
}
