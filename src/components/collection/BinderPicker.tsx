"use client";

import { useId } from "react";
import { STORAGE_TYPE_LABEL, type StorageType } from "@/lib/domain/enums";
import { cn } from "@/lib/ui";
import type { BinderValue, LocationOption } from "@/lib/collection/binderChoice";

export type { BinderValue, LocationOption };

// Pick where cards go: one of your storage locations (binders first), a new binder, or nowhere.

export function BinderPicker({ locations, value, onChange, label = "Binder" }: { locations: LocationOption[]; value: BinderValue; onChange: (v: BinderValue) => void; label?: string }) {
  const id = useId();
  const sorted = [...locations].sort((a, b) => (a.type === "BINDER" ? 0 : 1) - (b.type === "BINDER" ? 0 : 1) || a.name.localeCompare(b.name));
  const selectValue = "id" in value ? value.id : "newName" in value ? "__new" : "__none";
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "__new" ? { newName: "" } : v === "__none" ? { none: true } : { id: v });
        }}
        className={cn("h-10 w-full rounded-[var(--radius-control)] border border-rule bg-sheet px-3 pr-8 text-sm focus:border-quill focus:outline-none")}
        data-testid="binder-select"
      >
        {sorted.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
            {l.type !== "BINDER" ? ` (${STORAGE_TYPE_LABEL[l.type as StorageType] ?? l.type})` : ""}
          </option>
        ))}
        <option value="__new">+ New binder…</option>
        <option value="__none">No binder</option>
      </select>
      {"newName" in value && (
        <input
          aria-label="New binder name"
          value={value.newName}
          maxLength={60}
          onChange={(e) => onChange({ newName: e.target.value })}
          placeholder="e.g. OGN"
          className="h-10 w-full rounded-[var(--radius-control)] border border-rule bg-sheet px-3 text-sm focus:border-quill focus:outline-none"
          data-testid="binder-new-name"
        />
      )}
    </div>
  );
}
