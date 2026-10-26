"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUserId, isDemoMode } from "@/lib/currentUser";
import { CURRENCIES } from "@/lib/domain/enums";
import { dayKey, dayToDate } from "@/config/app";
import { parseImportText } from "@/lib/import/rows";
import { resolveRows, type ResolvedRow } from "@/lib/import/resolve";
import { quoteVariants } from "@/lib/prices/quote";
import { evaluateWatches } from "@/lib/alerts/service";
import type { Result } from "@/app/collection/actions";

const MAX_ROWS = 2000;

const Defaults = z.object({
  currency: z.enum(CURRENCIES),
  acquiredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date").refine((d) => d <= dayKey(), "The date can't be in the future"),
  seller: z.string().trim().max(120),
  missingPrice: z.enum(["market", "zero"]),
});
export type ImportDefaults = z.input<typeof Defaults>;

export interface PreviewRow extends ResolvedRow {
  importable: boolean;
  /** Unit cost that will be recorded (row currency), and whether it came from the market price. */
  unitCost: number | null;
  costFrom: "row" | "landed" | "market" | "zero" | null;
  currencyUsed: string;
  dateUsed: string;
}

async function build(text: string, d: z.output<typeof Defaults>) {
  const parsed = parseImportText(text);
  if (parsed.rows.length > MAX_ROWS) throw new Error(`That's ${parsed.rows.length} rows — import at most ${MAX_ROWS} at a time.`);
  const resolved = await resolveRows(db, parsed.rows);
  const userId = await getCurrentUserId();
  const demo = await isDemoMode();
  // Market prices for rows without a price, in each row's currency.
  const needMarket = d.missingPrice === "market" ? resolved.filter((r) => r.variantId && r.unitPrice == null && r.landedTotal == null) : [];
  const quotesBy = new Map<string, Awaited<ReturnType<typeof quoteVariants>>["quotes"]>();
  for (const cur of new Set(needMarket.map((r) => r.currency ?? d.currency))) {
    const ids = needMarket.filter((r) => (r.currency ?? d.currency) === cur).map((r) => r.variantId!);
    quotesBy.set(cur, (await quoteVariants(db, userId, demo, ids, cur)).quotes);
  }
  const rows: PreviewRow[] = resolved.map((r) => {
    const currencyUsed = r.currency ?? d.currency;
    const dateUsed = r.acquiredOn ?? d.acquiredOn;
    let unitCost: number | null = null;
    let costFrom: PreviewRow["costFrom"] = null;
    if (r.landedTotal != null) {
      unitCost = Math.floor(r.landedTotal / r.quantity);
      costFrom = "landed";
    } else if (r.unitPrice != null) {
      unitCost = r.unitPrice;
      costFrom = "row";
    } else if (r.variantId && d.missingPrice === "market") {
      const q = quotesBy.get(currencyUsed)?.[r.variantId];
      unitCost = q?.unit ?? 0;
      costFrom = q ? "market" : "zero";
    } else if (r.variantId) {
      unitCost = 0;
      costFrom = "zero";
    }
    const future = dateUsed > dayKey();
    const importable = !!r.variantId && r.status !== "invalid" && r.status !== "missing" && !future;
    return { ...r, unitCost, costFrom, currencyUsed, dateUsed, importable, note: future ? "Date is in the future" : r.note };
  });
  return { kind: parsed.kind, unknownColumns: parsed.unknownColumns, rows };
}

export async function previewImport(text: string, defaults: ImportDefaults): Promise<Result<Awaited<ReturnType<typeof build>>>> {
  const d = Defaults.safeParse(defaults);
  if (!d.success) return { ok: false, message: d.error.issues[0].message };
  if (!text.trim()) return { ok: false, message: "Paste a list or choose a CSV file first." };
  try {
    return { ok: true, data: await build(text, d.data) };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Re-reads and re-matches the text on the server (never trusts the preview), then saves. */
export async function commitImport(text: string, defaults: ImportDefaults): Promise<Result<{ lots: number; orders: number; cards: number; skipped: number }>> {
  const d = Defaults.safeParse(defaults);
  if (!d.success) return { ok: false, message: d.error.issues[0].message };
  if (await isDemoMode()) return { ok: false, message: "Exit demo mode before importing your own cards." };
  const userId = await getCurrentUserId();
  let built: Awaited<ReturnType<typeof build>>;
  try {
    built = await build(text, d.data);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  const ok = built.rows.filter((r) => r.importable);
  if (!ok.length) return { ok: false, message: "No rows could be matched to a card — check the preview." };
  const seller = d.data.seller.trim() || "Imported";

  const groups = new Map<string, PreviewRow[]>();
  for (const r of ok) {
    const k = `${r.dateUsed}|${r.seller ?? seller}|${r.currencyUsed}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  await db.$transaction(
    async (tx) => {
      const locs = new Map((await tx.storageLocation.findMany({ where: { userId } })).map((l) => [l.name.toLowerCase(), l.id]));
      for (const name of new Set(ok.map((r) => r.storage).filter(Boolean) as string[])) {
        if (!locs.has(name.toLowerCase())) locs.set(name.toLowerCase(), (await tx.storageLocation.create({ data: { userId, name, type: "OTHER" } })).id);
      }
      for (const [k, rows] of groups) {
        const [day, who, currency] = k.split("|");
        const order = await tx.order.create({ data: { userId, orderedOn: dayToDate(day), seller: who, currency, notes: `Bulk import (${rows.length} line${rows.length === 1 ? "" : "s"})` } });
        for (const r of rows) {
          const total = r.landedTotal ?? (r.unitCost ?? 0) * r.quantity;
          await tx.lot.create({
            data: {
              userId,
              orderId: order.id,
              variantId: r.variantId!,
              quantity: r.quantity,
              remainingQuantity: r.quantity,
              unitPrice: r.unitCost ?? 0,
              landedTotal: total,
              landedUnitCost: Math.floor(total / r.quantity),
              currency,
              condition: r.condition,
              acquiredOn: dayToDate(day),
              storageLocationId: r.storage ? (locs.get(r.storage.toLowerCase()) ?? null) : null,
              notes: [r.notes, r.costFrom === "market" ? "cost = market price at import" : r.costFrom === "zero" ? "no price given" : null].filter(Boolean).join(" · ") || null,
            },
          });
        }
      }
    },
    { timeout: 60_000 },
  );
  await evaluateWatches(db).catch(() => 0);
  revalidatePath("/", "layout");
  return { ok: true, data: { lots: ok.length, orders: groups.size, cards: ok.reduce((a, r) => a + r.quantity, 0), skipped: built.rows.length - ok.length } };
}
