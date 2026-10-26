"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { deleteOrder } from "../../actions";

export function DeleteOrderButton({ orderId, disabled }: { orderId: string; disabled: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (disabled) return <p className="max-w-56 text-right text-xs text-ink-3">Cards from this order have been sold, so it can&apos;t be deleted.</p>;
  if (!confirming)
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Delete order
      </Button>
    );
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-sm text-loss">{msg}</span>}
      <span className="text-sm text-ink-2">Removes these cards from your collection.</span>
      <Button
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await deleteOrder(orderId);
            if (r.ok) router.push("/collection/orders");
            else setMsg(r.message);
          })
        }
      >
        {pending ? "Deleting…" : "Delete"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Keep
      </Button>
    </div>
  );
}
