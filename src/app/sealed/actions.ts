"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUserId, isDemoMode } from "@/lib/currentUser";
import { CONDITIONS, CURRENCIES, SEALED_KINDS } from "@/lib/domain/enums";
import { dayKey, dayToDate } from "@/config/app";
import { allocatePackCost } from "@/lib/sealed/pack";
import { quoteVariants } from "@/lib/prices/quote";
import type { Result } from "@/app/collection/actions";

const minor = z.number().int("Amounts must be whole minor units").min(0, "Amounts can't be negative").max(1_000_000_000, "That amount is too large");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date").refine((d) => d <= dayKey(), "The date can't be in the future");

function fieldErrors(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of e.issues) out[i.path.join(".")] ??= i.message;
  return out;
}

function refresh() {
  revalidatePath("/sealed", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/collection", "layout");
  revalidatePath("/reports");
}

// ───────────────────────────── Add / edit sealed ─────────────────────────────

const SealedInput = z.object({
  name: z.string().trim().min(1, "Name the product").max(200),
  kind: z.enum(SEALED_KINDS),
  tcgplayerId: z.string().nullish(),
  quantity: z.number().int().min(1, "At least 1").max(10_000),
  unitPrice: minor,
  extras: minor, // shipping, forwarding, tax for the whole purchase
  currency: z.enum(CURRENCIES),
  acquiredOn: day,
  storageLocationId: z.string().nullish(),
  notes: z.string().trim().max(1000).optional(),
});
export type SealedPayload = z.input<typeof SealedInput>;

/** Landed cost per unit: (price × qty + extras) / qty, rounded to the nearest minor unit. */
function landedUnit(unitPrice: number, quantity: number, extras: number) {
  return Math.round((unitPrice * quantity + extras) / quantity);
}

export async function addSealed(payload: SealedPayload): Promise<Result<{ id: string }>> {
  const parsed = SealedInput.safeParse(payload);
  if (!parsed.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const s = parsed.data;
  const userId = await getCurrentUserId();
  let imageUrl: string | null = null;
  if (s.tcgplayerId) {
    const p = await db.tcgProduct.findUnique({ where: { productId: s.tcgplayerId } });
    if (!p || p.isSingle) return { ok: false, message: "That TCGplayer product isn't a sealed product — pick another or clear it." };
    imageUrl = p.imageUrl;
  }
  if (s.storageLocationId && !(await db.storageLocation.findFirst({ where: { id: s.storageLocationId, userId } }))) {
    return { ok: false, message: "That storage location no longer exists." };
  }
  const row = await db.sealedProduct.create({
    data: {
      userId,
      name: s.name,
      kind: s.kind,
      tcgplayerId: s.tcgplayerId || null,
      quantity: s.quantity,
      remaining: s.quantity,
      landedUnitCost: landedUnit(s.unitPrice, s.quantity, s.extras),
      currency: s.currency,
      acquiredOn: dayToDate(s.acquiredOn),
      storageLocationId: s.storageLocationId || null,
      notes: s.notes || null,
      imageUrl,
    },
  });
  refresh();
  return { ok: true, data: { id: row.id } };
}

export async function deleteSealed(id: string): Promise<Result> {
  const userId = await getCurrentUserId();
  const s = await db.sealedProduct.findFirst({ where: { id, userId }, include: { _count: { select: { openings: true } } } });
  if (!s) return { ok: false, message: "That product no longer exists." };
  if (s._count.openings > 0) return { ok: false, message: "You've opened some of these. Undo those openings first." };
  await db.sealedProduct.delete({ where: { id } });
  refresh();
  return { ok: true, data: undefined, message: "Deleted." };
}

const ManualInput = z.object({ id: z.string(), price: minor.nullable(), currency: z.enum(CURRENCIES) });
export async function setSealedPrice(payload: z.input<typeof ManualInput>): Promise<Result> {
  const parsed = ManualInput.safeParse(payload);
  if (!parsed.success) return { ok: false, message: "Enter a price like 4500.00", fieldErrors: fieldErrors(parsed.error) };
  const userId = await getCurrentUserId();
  const n = await db.sealedProduct.updateMany({
    where: { id: parsed.data.id, userId },
    data: { manualPrice: parsed.data.price, manualCurrency: parsed.data.price == null ? null : parsed.data.currency },
  });
  if (!n.count) return { ok: false, message: "That product no longer exists." };
  refresh();
  return { ok: true, data: undefined, message: parsed.data.price == null ? "Manual price cleared." : "Manual price saved." };
}

// ───────────────────────────── Open a pack / box ─────────────────────────────

/** Live unit prices for the pull list, in the box's currency (same price book as card pages). */
export async function quotePulls(variantIds: string[], currency: string) {
  if (!CURRENCIES.includes(currency as (typeof CURRENCIES)[number])) throw new Error("Unknown currency");
  const userId = await getCurrentUserId();
  return quoteVariants(db, userId, await isDemoMode(), variantIds.slice(0, 500), currency);
}

const OpenInput = z.object({
  sealedId: z.string().min(1),
  openedOn: day,
  storageLocationId: z.string().nullish(),
  pulls: z
    .array(z.object({ variantId: z.string().min(1, "Pick a card"), quantity: z.number().int().min(1).max(1000), condition: z.enum(CONDITIONS) }))
    .min(1, "Add at least one pull"),
});
export type OpenPayload = z.input<typeof OpenInput>;

export async function openSealed(payload: OpenPayload): Promise<Result<{ openingId: string }>> {
  const parsed = OpenInput.safeParse(payload);
  if (!parsed.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const o = parsed.data;
  const userId = await getCurrentUserId();
  const sealed = await db.sealedProduct.findFirst({ where: { id: o.sealedId, userId } });
  if (!sealed) return { ok: false, message: "That product no longer exists." };
  if (sealed.remaining < 1) return { ok: false, message: "You've already opened all of these." };
  if (o.openedOn < dayKey(sealed.acquiredOn)) return { ok: false, message: "You can't open it before you bought it.", fieldErrors: { openedOn: "On or after the purchase date" } };

  // Merge duplicate lines (same printing + condition) so each becomes one lot.
  const merged = new Map<string, { variantId: string; quantity: number; condition: string }>();
  for (const p of o.pulls) {
    const k = `${p.variantId}|${p.condition}`;
    const e = merged.get(k);
    if (e) e.quantity += p.quantity;
    else merged.set(k, { ...p });
  }
  const pulls = [...merged.entries()];
  const variantIds = [...new Set(pulls.map(([, p]) => p.variantId))];
  if ((await db.cardVariant.count({ where: { id: { in: variantIds } } })) !== variantIds.length) {
    return { ok: false, message: "One of the cards no longer exists — re-pick it." };
  }

  // Price each pull now, in the box's currency; the box's landed cost is split by those values.
  const { quotes, missing } = await quoteVariants(db, userId, await isDemoMode(), variantIds, sealed.currency);
  if (missing.length) return { ok: false, message: `No exchange rate for ${missing.join(", ")} yet — run the price job or set a rate in Settings.` };
  const boxCost = sealed.landedUnitCost;
  const alloc = allocatePackCost(
    boxCost,
    pulls.map(([k, p]) => ({ key: k, quantity: p.quantity, unitMarket: quotes[p.variantId]?.unit ?? 0 })),
  );
  const pullsValue = alloc.reduce((a, p) => a + p.lineValue, 0);
  const acquiredOn = dayToDate(o.openedOn);
  const storageLocationId = o.storageLocationId || sealed.storageLocationId || null;

  const opening = await db.$transaction(async (tx) => {
    const fresh = await tx.sealedProduct.updateMany({ where: { id: sealed.id, remaining: { gte: 1 } }, data: { remaining: { decrement: 1 } } });
    if (!fresh.count) throw new Error("You've already opened all of these.");
    const opening = await tx.packOpening.create({
      data: { userId, sealedProductId: sealed.id, openedOn: acquiredOn, costBasis: boxCost, pullsValue, currency: sealed.currency },
    });
    for (const a of alloc) {
      const p = merged.get(a.key)!;
      await tx.lot.create({
        data: {
          userId,
          packOpeningId: opening.id,
          variantId: p.variantId,
          quantity: p.quantity,
          remainingQuantity: p.quantity,
          unitPrice: Math.floor(a.costBasis / p.quantity),
          landedTotal: a.costBasis,
          landedUnitCost: Math.floor(a.costBasis / p.quantity),
          currency: sealed.currency,
          condition: p.condition,
          acquiredOn,
          storageLocationId,
          notes: `Pulled from ${sealed.name}`,
        },
      });
    }
    return opening;
  });
  refresh();
  return { ok: true, data: { openingId: opening.id } };
}

export async function undoOpening(openingId: string): Promise<Result> {
  const userId = await getCurrentUserId();
  const o = await db.packOpening.findFirst({ where: { id: openingId, userId }, include: { lots: { include: { _count: { select: { saleAllocations: true } } } } } });
  if (!o) return { ok: false, message: "That opening no longer exists." };
  if (o.lots.some((l) => l._count.saleAllocations > 0)) return { ok: false, message: "Some of these pulls have been sold. Delete those sales first." };
  await db.$transaction([
    db.lot.deleteMany({ where: { packOpeningId: o.id } }),
    db.packOpening.delete({ where: { id: o.id } }),
    db.sealedProduct.update({ where: { id: o.sealedProductId }, data: { remaining: { increment: 1 } } }),
  ]);
  refresh();
  return { ok: true, data: undefined, message: "Opening undone — the product is back in your sealed stock." };
}
