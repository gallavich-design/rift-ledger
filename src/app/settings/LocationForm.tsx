"use client";

import { useActionState, useEffect, useRef } from "react";
import { STORAGE_TYPES, STORAGE_TYPE_LABEL, type StorageType } from "@/lib/domain/enums";
import { cn } from "@/lib/ui";
import { createLocation, updateLocation, type ActionState } from "./actions";
import { Button } from "@/components/ui/Button";

interface Props {
  mode: "create" | "edit";
  initial?: { id: string; name: string; type: StorageType; notes: string | null };
  onDone?: () => void;
}

export function LocationForm({ mode, initial, onDone }: Props) {
  const action = mode === "edit" && initial ? updateLocation.bind(null, initial.id) : createLocation;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, { ok: false });
  const formRef = useRef<HTMLFormElement>(null);
  const idp = mode === "edit" ? `loc-${initial?.id}` : "loc-new";

  useEffect(() => {
    if (state.ok) {
      if (mode === "create") formRef.current?.reset();
      onDone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4" noValidate>
      <div>
        <label htmlFor={`${idp}-name`} className="mb-1.5 block text-sm font-medium">
          Name
        </label>
        <input
          id={`${idp}-name`}
          name="name"
          defaultValue={initial?.name}
          required
          maxLength={80}
          placeholder="e.g. Binder 1 – Origins"
          aria-invalid={!!state.fieldErrors?.name}
          aria-describedby={state.fieldErrors?.name ? `${idp}-name-err` : undefined}
          className={cn(
            "h-10 w-full rounded-[var(--radius-control)] border bg-inset px-3 text-[15px] placeholder:text-ink-4 focus:border-quill focus:bg-sheet focus:outline-none",
            state.fieldErrors?.name ? "border-loss" : "border-rule hover:border-rule-strong",
          )}
        />
        {state.fieldErrors?.name && (
          <p id={`${idp}-name-err`} className="mt-1 text-sm text-loss">
            {state.fieldErrors.name}
          </p>
        )}
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Type</legend>
        <div className="flex flex-wrap gap-1.5">
          {STORAGE_TYPES.map((t, i) => (
            <label key={t} className="cursor-pointer">
              <input
                type="radio"
                name="type"
                value={t}
                defaultChecked={initial ? initial.type === t : i === 0}
                className="peer sr-only"
              />
              <span className="inline-flex h-8 items-center rounded-full border border-rule bg-sheet px-3 text-[13px] text-ink-2 peer-checked:border-quill peer-checked:bg-quill-tint peer-checked:font-medium peer-checked:text-quill peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-quill hover:border-rule-strong">
                {STORAGE_TYPE_LABEL[t]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={`${idp}-notes`} className="mb-1.5 block text-sm font-medium">
          Notes <span className="font-normal text-ink-3">(optional)</span>
        </label>
        <input
          id={`${idp}-notes`}
          name="notes"
          defaultValue={initial?.notes ?? ""}
          maxLength={500}
          placeholder="Shelf, colour of the box, what's inside…"
          className="h-10 w-full rounded-[var(--radius-control)] border border-rule bg-inset px-3 text-[15px] placeholder:text-ink-4 hover:border-rule-strong focus:border-quill focus:bg-sheet focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Add location" : "Save"}
        </Button>
        {mode === "edit" && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        <p role="status" className={cn("text-sm", state.ok ? "text-gain" : "text-loss")}>
          {state.message}
        </p>
      </div>
    </form>
  );
}
