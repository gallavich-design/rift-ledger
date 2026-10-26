"use client";

import { useState, useTransition } from "react";
import type { StorageType } from "@/lib/domain/enums";
import { Button } from "@/components/ui/Button";
import { LocationForm } from "./LocationForm";
import { deleteLocation } from "./actions";

interface Loc {
  id: string;
  name: string;
  type: StorageType;
  notes: string | null;
  lots: number;
}

export function LocationRow({ location, typeLabel }: { location: Loc; typeLabel: string }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  return (
    <li id={`location-${location.id}`} className="scroll-mt-20 border-b border-rule-soft last:border-b-0 target:bg-quill-tint/50">
      {editing ? (
        <div className="p-4">
          <LocationForm mode="edit" initial={location} onDone={() => setEditing(false)} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium">{location.name}</p>
            <p className="mt-0.5 truncate text-xs text-ink-3">
              {typeLabel}
              {location.notes && <> · {location.notes}</>}
              <span className="num"> · {location.lots} {location.lots === 1 ? "lot" : "lots"}</span>
            </p>
          </div>
          {confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-2">{location.lots ? "Cards here become unassigned." : "Delete?"}</span>
              <Button
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() => start(() => deleteLocation(location.id))}
              >
                {pending ? "Deleting…" : "Delete"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Keep
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label={`Edit ${location.name}`}>
                Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} aria-label={`Delete ${location.name}`}>
                Delete
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
