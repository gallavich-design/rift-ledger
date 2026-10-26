"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { allocateLandedCost } from "@/lib/money/landedCost";
import { consumeFifo, InsufficientQuantityError } from "@/lib/money/fifo";
import { CONDITIONS, CURRENCIES } from "@/lib/domain/enums";
import { dayKey, dayToDate } from "@/config/app";
import { evaluateWatches } from "@/lib/alerts/service";

export type Result<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; message: string; fieldErrors?: Record<string, string> };

const minor = z.number().int("Amounts must be whole minor units").min(0, "Amounts can't be negative").max(1_000_000_000, "That amount is too large");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const notInFuture = (d: string) => d <= dayKey();

function fieldErrors(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of e.issues) out[i.path.join(".")] ??= i.message;
  return out;
}

function refresh() {
  revalidatePath("/dashboard");
  revalidatePath("/collection", "layout");
  revalidatePath("/cards", "layout");
}

async function assertOwnedVariants(variantIds: string[]) {
  const n = await db.cardVariant.count({ where: { id: { in: variantIds } } });
  if (n !== new Set(variantIds).size) throw new Error("One of the cards no longer exists — re-pick it.");
}

// ───────────────────────────── Orders (buy) ─────────────────────────────

const OrderInput = z.object({
  orderedOn: day.refine(notInFuture, "The order date can't be in the future"),
  seller: z.string().trim().min(1, "Who did you buy from?").max(120),
  currency: z.enum(CURRENCIES),
  shipping: minor,
  forwardingFee: minor,
  importTax: minor,
  otherFees: minor,
  notes: z.string().trim().max(1000).optional(),
  lines: z
    .array(
      z.object({
        variantId: z.string().min(1, "Pick a card"),
        quantity: z.number().int().min(1, "At least 1").max(10_000),
        unitPrice: minor,
        condition: z.enum(CONDITIONS),
        storageLocationId: z.string().nullish(),
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .min(1, "Add at least one card"),
});
export type OrderPayload = z.input<typeof OrderInput>;

export async function createOrder(payload: OrderPayload): Promise<Result<{ orderId: string }>> {
  const parsed = OrderInput.safeParse(payload);
  if (!parsed.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const o = parsed.data;
  const userId = await getCurrentUserId();
  try {
    await assertOwnedVariants(o.lines.map((l) => l.variantId));
    const locIds = [...new Set(o.lines.map((l) => l.storageLocationId).filter(Boolean))] as string[];
    if (locIds.length && (await db.storageLocation.count({ where: { id: { in: locIds }, userId } })) !== locIds.length) {
      return { ok: false, message: "A storage location no longer exists — pick another." };
    }
    const extras = o.shipping + o.forwardingFee + o.importTax + o.otherFees;
    const landed = allocateLandedCost(
      o.lines.map((l, i) => ({ key: String(i), quantity: l.quantity, unitPrice: l.unitPrice })),
      extras,
    );
    const acquiredOn = dayToDate(o.orderedOn);
    const order = await db.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId,
          orderedOn: acquiredOn,
          seller: o.seller,
          currency: o.currency,
          shipping: o.shipping,
          forwardingFee: o.forwardingFee,
          importTax: o.importTax,
          otherFees: o.otherFees,
          notes: o.notes || null,
        },
      });
      for (const [i, l] of o.lines.entries()) {
        await tx.lot.create({
          data: {
            userId,
            orderId: order.id,
            variantId: l.variantId,
            quantity: l.quantity,
            remainingQuantity: l.quantity,
            unitPrice: l.unitPrice,
            landedTotal: landed[i].landedTotal,
            landedUnitCost: landed[i].landedUnitCost,
            currency: o.currency,
            condition: l.condition,
            acquiredOn,
            storageLocationId: l.storageLocationId || null,
            notes: l.notes || null,
          },
        });
      }
      return order;
    });
    refresh();
    return { ok: true, data: { orderId: order.id } };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function deleteOrder(orderId: string): Promise<Result> {
  const userId = await getCurrentUserId();
  const order = await db.order.findFirst({ where: { id: orderId, userId }, include: { lots: { include: { _count: { select: { saleAllocations: true } } } } } });
  if (!order) return { ok: false, message: "That order no longer exists." };
  if (order.lots.some((l) => l._count.saleAllocations > 0)) {
    return { ok: false, message: "Some of these cards have been sold. Delete those sales first." };
  }
  await db.$transaction([db.lot.deleteMany({ where: { orderId } }), db.order.delete({ where: { id: orderId } })]);
  refresh();
  return { ok: true, data: undefined, message: "Order deleted." };
}

// ───────────────────────────── Sales (sell) ─────────────────────────────

const SaleInputSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1, "Sell at least 1"),
  unitPrice: minor,
  fees: minor,
  currency: z.enum(CURRENCIES),
  soldOn: day.refine(notInFuture, "The sale date can't be in the future"),
  buyer: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type SalePayload = z.input<typeof SaleInputSchema>;

export async function recordSale(payload: SalePayload): Promise<Result<{ saleId: string; realized: number }>> {
  const parsed = SaleInputSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const s = parsed.data;
  const userId = await getCurrentUserId();
  const soldOn = dayToDate(s.soldOn);
  try {
    const out = await db.$transaction(async (tx) => {
      const lots = await tx.lot.findMany({
        where: { userId, variantId: s.variantId, remainingQuantity: { gt: 0 }, acquiredOn: { lte: soldOn } },
      });
      const allocations = consumeFifo(lots, s.quantity);
      const sale = await tx.sale.create({
        data: {
          userId,
          variantId: s.variantId,
          quantity: s.quantity,
          unitPrice: s.unitPrice,
          fees: s.fees,
          currency: s.currency,
          soldOn,
          buyer: s.buyer || null,
          notes: s.notes || null,
          allocations: { create: allocations.map((a) => ({ lotId: a.lotId, quantity: a.quantity, costBasis: a.costBasis })) },
        },
      });
      for (const a of allocations) {
        await tx.lot.update({ where: { id: a.lotId }, data: { remainingQuantity: { decrement: a.quantity } } });
      }
      const lotCurrency = lots[0]?.currency;
      const sameCurrency = lots.every((l) => l.currency === s.currency);
      const realized = sameCurrency ? s.quantity * s.unitPrice - s.fees - allocations.reduce((a, x) => a + x.costBasis, 0) : NaN;
      return { saleId: sale.id, realized, lotCurrency };
    });
    refresh();
    return { ok: true, data: { saleId: out.saleId, realized: out.realized } };
  } catch (e) {
    if (e instanceof InsufficientQuantityError) {
      return { ok: false, message: `${e.message} on or before that date.`, fieldErrors: { quantity: e.message } };
    }
    return { ok: false, message: (e as Error).message };
  }
}

export async function deleteSale(saleId: string): Promise<Result> {
  const userId = await getCurrentUserId();
  const sale = await db.sale.findFirst({ where: { id: saleId, userId }, include: { allocations: true } });
  if (!sale) return { ok: false, message: "That sale no longer exists." };
  await db.$transaction([
    ...sale.allocations.map((a) => db.lot.update({ where: { id: a.lotId }, data: { remainingQuantity: { increment: a.quantity } } })),
    db.sale.delete({ where: { id: saleId } }),
  ]);
  refresh();
  return { ok: true, data: undefined, message: "Sale deleted — the cards are back in your collection." };
}

// ───────────────────────────── Lots ─────────────────────────────

export async function moveLot(lotId: string, storageLocationId: string | null): Promise<Result> {
  const userId = await getCurrentUserId();
  if (storageLocationId && !(await db.storageLocation.findFirst({ where: { id: storageLocationId, userId } }))) {
    return { ok: false, message: "That location no longer exists." };
  }
  const r = await db.lot.updateMany({ where: { id: lotId, userId }, data: { storageLocationId } });
  if (!r.count) return { ok: false, message: "That purchase no longer exists." };
  refresh();
  return { ok: true, data: undefined };
}

// ───────────────────────────── Prices ─────────────────────────────

const LocalInput = z.object({
  variantId: z.string().min(1),
  price: minor.min(1, "Enter a price"),
  whereSeen: z.string().trim().min(1, "Where did you see it?").max(120),
  seenOn: day.refine(notInFuture, "That date is in the future"),
  note: z.string().trim().max(500).optional(),
});
export type LocalPayload = z.input<typeof LocalInput>;

export async function reportLocalPrice(payload: LocalPayload): Promise<Result> {
  const parsed = LocalInput.safeParse(payload);
  if (!parsed.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const userId = await getCurrentUserId();
  const p = parsed.data;
  await assertOwnedVariants([p.variantId]);
  await db.localPriceReport.create({
    data: { userId, variantId: p.variantId, price: p.price, currency: "THB", whereSeen: p.whereSeen, seenOn: dayToDate(p.seenOn), note: p.note || null },
  });
  await evaluateWatches(db, { userId, variantIds: [p.variantId] });
  refresh();
  return { ok: true, data: undefined, message: "Local price saved." };
}

const ManualInput = z.object({
  variantId: z.string().min(1),
  price: minor.min(1, "Enter a price"),
  currency: z.enum(CURRENCIES),
  note: z.string().trim().max(500).optional(),
});
export type ManualPayload = z.input<typeof ManualInput>;

export async function setManualPrice(payload: ManualPayload): Promise<Result> {
  const parsed = ManualInput.safeParse(payload);
  if (!parsed.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const userId = await getCurrentUserId();
  const m = parsed.data;
  await assertOwnedVariants([m.variantId]);
  const today = dayKey();
  await db.$transaction([
    db.manualPrice.upsert({
      where: { userId_variantId: { userId, variantId: m.variantId } },
      update: { price: m.price, currency: m.currency, note: m.note || null },
      create: { userId, variantId: m.variantId, price: m.price, currency: m.currency, note: m.note || null },
    }),
    // keep a dated history so the override charts like any other source
    db.priceSnapshot.upsert({
      where: { variantId_source_day: { variantId: m.variantId, source: "MANUAL", day: today } },
      update: { market: m.price, currency: m.currency, capturedAt: new Date() },
      create: { variantId: m.variantId, source: "MANUAL", day: today, market: m.price, currency: m.currency },
    }),
  ]);
  await evaluateWatches(db, { userId, variantIds: [m.variantId] });
  refresh();
  return { ok: true, data: undefined, message: "Manual price set — it overrides every source for this printing." };
}

export async function clearManualPrice(variantId: string): Promise<Result> {
  const userId = await getCurrentUserId();
  await db.manualPrice.deleteMany({ where: { userId, variantId } });
  await evaluateWatches(db, { userId, variantIds: [variantId] });
  refresh();
  return { ok: true, data: undefined, message: "Manual price removed." };
}
