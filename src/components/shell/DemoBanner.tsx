"use client";

import { useTransition } from "react";
import { exitDemo } from "@/app/settings/actions";

/** Always visible while demo mode is on, so demo numbers are never mistaken for real ones. */
export function DemoBanner() {
  const [pending, start] = useTransition();
  return (
    <div role="status" className="sticky top-12 z-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-caution/25 bg-caution-tint px-4 py-2 text-center text-sm text-caution md:top-0">
      <span>
        <strong className="font-semibold">Demo data</strong> — made-up purchases and prices. Your own collection is untouched.
      </span>
      <button type="button" onClick={() => start(() => exitDemo())} disabled={pending} className="font-medium underline underline-offset-2 hover:no-underline">
        {pending ? "Switching…" : "Back to my data"}
      </button>
    </div>
  );
}
