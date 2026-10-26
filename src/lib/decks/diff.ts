// Version history: a snapshot of the list on every save, and the change from the previous one.

import type { Section } from "./types";

export interface SnapshotLine {
  cardId: string;
  name: string;
  section: Section;
  quantity: number;
  proxyQuantity: number;
  preferredVariantId?: string | null;
}

export interface DiffEntry {
  cardId: string;
  name: string;
  section: Section;
  delta: number; // +2 added, −1 removed
}

export function diffSnapshots(prev: SnapshotLine[], next: SnapshotLine[]): DiffEntry[] {
  const key = (l: { cardId: string; section: string }) => `${l.section}|${l.cardId}`;
  const before = new Map(prev.map((l) => [key(l), l]));
  const after = new Map(next.map((l) => [key(l), l]));
  const out: DiffEntry[] = [];
  for (const k of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(k);
    const b = after.get(k);
    const delta = (b?.quantity ?? 0) - (a?.quantity ?? 0);
    if (delta) {
      const l = (b ?? a)!;
      out.push({ cardId: l.cardId, name: l.name, section: l.section, delta });
    }
  }
  // removals first, then additions; alphabetical within each
  return out.sort((x, y) => Math.sign(x.delta) - Math.sign(y.delta) || x.name.localeCompare(y.name));
}

/** "−2 Card X, +2 Card Y" (proper minus sign). */
export function formatDiff(diff: DiffEntry[]): string {
  if (!diff.length) return "No card changes";
  return diff.map((d) => `${d.delta > 0 ? "+" : "−"}${Math.abs(d.delta)} ${d.name}`).join(", ");
}
