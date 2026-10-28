// Where "Add to collection" / "Complete the set" put cards. Plain module (no "use client"), so server
// pages can work out a default and the client picker can share the types.

export interface LocationOption {
  id: string;
  name: string;
  type: string;
}

export type BinderValue = { id: string } | { newName: string } | { none: true };

/** A location with this name if you have one, else a new binder named so. */
export function suggestBinder(locations: LocationOption[], name: string): BinderValue {
  const match = locations.find((l) => l.name.toLowerCase() === name.toLowerCase());
  return match ? { id: match.id } : { newName: name };
}
