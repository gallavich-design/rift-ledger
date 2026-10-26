"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { removeRuling } from "../actions";

export function DeleteRulingButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  if (!confirm)
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
        Delete ruling
      </Button>
    );
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-ink-2">Delete? Alerts already sent stay.</span>
      <Button
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await removeRuling(id);
            router.push("/news?tab=rulings");
          })
        }
      >
        Delete
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
        Keep
      </Button>
    </div>
  );
}
