"use client";

import { useActionState } from "react";
import { TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/Button";
import { signIn } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, { error: null });
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" autoFocus required error={state.error ?? undefined} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
