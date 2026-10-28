"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUserId, isDemoMode } from "@/lib/currentUser";
import { quoteVariants } from "@/lib/prices/quote";
import { loadSetSlots, missingToAdd } from "@/lib/collection/binder";
import { ALREADY_OWNED_NOTE } from "@/lib/collection/owned";
import { allocateLandedCost } from "@/lib/money/landedCost";
import { consumeFifo, costOfFirst, InsufficientQuantityError } from "@/lib/money/fifo";
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

// ───────────────────── Cards you already own ─────────────────────
// Cards pulled from packs, traded or owned from before are recorded without an order (no seller, no
// purchase) — like pack pulls. Their cost basis is today's market price by default, so value tracking
// starts from the day you add them; or 0 if you'd rather not record one.


/** Where the cards go: an existing location, a new binder by name (reused if that name exists), or none. */
const BinderChoice = z.union([
  z.object({ id: z.string().min(1) }),
  z.object({ newName: z.string().trim().min(1, "Name the binder").max(60, "That name is too long") }),
  z.object({ none: z.literal(true) }),
]);
type BinderChoiceT = z.infer<typeof BinderChoice>;
type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function resolveBinder(tx: Pick<typeof db, "storageLocation">, userId: string, b: BinderChoiceT): Promise<{ id: string | null; name: string | null }> {
  if ("none" in b) return { id: null, name: null };
  if ("id" in b) {
    const loc = await tx.storageLocation.findFirst({ where: { id: b.id, userId } });
    if (!loc) throw new UserError("That binder no longer exists — pick another.");
    return { id: loc.id, name: loc.name };
  }
  const loc = await tx.storageLocation.upsert({ where: { userId_name: { userId, name: b.newName } }, update: {}, create: { userId, name: b.newName, type: "BINDER" } });
  return { id: loc.id, name: loc.name };
}

class UserError extends Error {}

/** Market price per variant in the display currency (null = no price). */
async function marketUnits(userId: string, variantIds: string[]) {
  const q = await quoteVariants(db, userId, await isDemoMode(), variantIds);
  if (q.missing.length) throw new UserError(`No exchange rate for ${q.missing.join(", ")} yet — set one in Settings.`);
  return { currency: q.currency, unit: (id: string) => q.quotes[id]?.unit ?? null };
}

type Cost = "market" | "zero";

/** Inserts "already owned" copies in one statement; returns the new lot ids (for Undo). */
async function insertOwned(
  tx: Tx,
  userId: string,
  rows: { variantId: string; quantity: number; condition?: string }[],
  o: { cost: Cost; acquiredOn: Date; storageLocationId: string | null; market: { currency: string; unit: (id: string) => number | null } },
): Promise<string[]> {
  if (!rows.length) return [];
  const created = await tx.lot.createManyAndReturn({
    select: { id: true },
    data: rows.map((r) => {
      const price = o.market.unit(r.variantId);
      const unit = o.cost === "market" ? (price ?? 0) : 0;
      return {
        userId,
        variantId: r.variantId,
        quantity: r.quantity,
        remainingQuantity: r.quantity,
        unitPrice: unit,
        landedUnitCost: unit,
        landedTotal: unit * r.quantity,
        currency: o.market.currency,
        condition: r.condition ?? "NM",
        acquiredOn: o.acquiredOn,
        storageLocationId: o.storageLocationId,
        notes: `${ALREADY_OWNED_NOTE} · ${o.cost === "market" ? (price != null ? "cost = market price when added" : "no price — cost 0") : "cost not recorded"}`,
      };
    }),
  });
  return created.map((c) => c.id);
}

/**
 * Takes up to `n` unsold copies out of the given lots, in the order given. Each lot keeps its sold
 * copies (with the cost of its first units); removed copies take their share of the cost. Empty lots
 * are deleted, and so are orders left with no lots. Returns how many were taken.
 */
async function takeCopies(tx: Tx, lots: { id: string; quantity: number; remainingQuantity: number; landedTotal: number; orderId: string | null }[], n: number): Promise<number> {
  let left = n;
  const orders = new Set<string>();
  for (const lot of lots) {
    if (left <= 0) break;
    const take = Math.min(left, lot.remainingQuantity);
    if (!take) continue;
    const keep = lot.quantity - take;
    if (keep === 0) await tx.lot.delete({ where: { id: lot.id } });
    else {
      const landedTotal = costOfFirst(lot, keep);
      await tx.lot.update({ where: { id: lot.id }, data: { quantity: keep, remainingQuantity: lot.remainingQuantity - take, landedTotal, landedUnitCost: Math.floor(landedTotal / keep) } });
    }
    if (lot.orderId) orders.add(lot.orderId);
    left -= take;
  }
  for (const id of orders) if (!(await tx.lot.count({ where: { orderId: id } }))) await tx.order.delete({ where: { id } });
  return n - left;
}

const QuickAddInput = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1, "At least 1").max(1000),
  condition: z.enum(CONDITIONS),
  cost: z.enum(["market", "zero"]),
  binder: BinderChoice,
  acquiredOn: day.refine(notInFuture, "The date can't be in the future"),
});
export type QuickAddPayload = z.input<typeof QuickAddInput>;

/** "Add to collection": copies of one printing you already own, into a binder — not a purchase. */
export async function quickAddToCollection(payload: QuickAddPayload): Promise<Result<{ lotIds: string[]; binder: string | null }>> {
  const parsed = QuickAddInput.safeParse(payload);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message, fieldErrors: fieldErrors(parsed.error) };
  const o = parsed.data;
  const userId = await getCurrentUserId();
  const variant = await db.cardVariant.findUnique({ where: { id: o.variantId }, include: { card: { select: { name: true } } } });
  if (!variant) return { ok: false, message: "That card no longer exists — reload the page." };
  try {
    const market = await marketUnits(userId, [variant.id]);
    const result = await db.$transaction(async (tx) => {
      const loc = await resolveBinder(tx, userId, o.binder);
      const lotIds = await insertOwned(tx, userId, [{ variantId: variant.id, quantity: o.quantity, condition: o.condition }], { cost: o.cost, acquiredOn: dayToDate(o.acquiredOn), storageLocationId: loc.id, market });
      return { lotIds, binder: loc.name };
    });
    refresh();
    return { ok: true, data: result, message: `Added ${o.quantity} × ${variant.card.name}${result.binder ? ` to ${result.binder}` : ""}.` };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, message: e.message };
    throw e;
  }
}

/** Undo for the adds above: takes back the copies just added (any you've since sold stay). */
export async function undoAdded(lotIds: string[]): Promise<Result<{ removed: number }>> {
  const ids = z.array(z.string().min(1)).max(5000).safeParse(lotIds);
  if (!ids.success) return { ok: false, message: "Nothing to undo." };
  const userId = await getCurrentUserId();
  const lots = await db.lot.findMany({ where: { id: { in: ids.data }, userId } });
  const removed = await db.$transaction((tx) => takeCopies(tx, lots, lots.reduce((a, l) => a + l.remainingQuantity, 0)));
  refresh();
  return { ok: true, data: { removed }, message: removed ? `Undone — removed ${removed} ${removed === 1 ? "copy" : "copies"}.` : "Nothing left to undo." };
}

const CompleteSetInput = z.object({
  setCode: z.string().min(1),
  scope: z.enum(["base", "all"]),
  cost: z.enum(["market", "zero"]),
  binder: BinderChoice,
  moveOwned: z.boolean(),
  acquiredOn: day.refine(notInFuture, "The date can't be in the future"),
});
export type CompleteSetPayload = z.input<typeof CompleteSetInput>;

/**
 * "Complete the set": one copy of every card in the set's checklist you don't have yet, as cards you
 * already own, into the chosen binder. Optionally moves the copies you already had from this set
 * into the same binder.
 */
export async function completeSet(payload: CompleteSetPayload): Promise<Result<{ lotIds: string[]; added: number; moved: number; binder: string | null }>> {
  const parsed = CompleteSetInput.safeParse(payload);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const o = parsed.data;
  const userId = await getCurrentUserId();
  const set = await db.set.findUnique({ where: { code: o.setCode } });
  if (!set) return { ok: false, message: "That set isn't in the catalogue." };
  const held = await db.lot.groupBy({ by: ["variantId"], where: { userId, remainingQuantity: { gt: 0 } }, _sum: { remainingQuantity: true } });
  const ownedByVariant = new Map(held.map((h) => [h.variantId, h._sum.remainingQuantity ?? 0]));
  const slots = await loadSetSlots(db, set.id, o.scope, [...ownedByVariant.keys()]);
  const toAdd = missingToAdd(slots, ownedByVariant);
  const setVariantIds = slots.flatMap((s) => s.variantIds);
  if (!toAdd.length && !o.moveOwned) return { ok: true, data: { lotIds: [], added: 0, moved: 0, binder: null }, message: `You already have every card in ${set.name}.` };

  try {
    const market = await marketUnits(userId, toAdd.map((t) => t.variantId));
    const result = await db.$transaction(
      async (tx) => {
        const loc = await resolveBinder(tx, userId, o.binder);
        let moved = 0;
        if (o.moveOwned && loc.id) {
          const where = { userId, remainingQuantity: { gt: 0 }, variantId: { in: setVariantIds }, OR: [{ storageLocationId: null }, { storageLocationId: { not: loc.id } }] };
          moved = (await tx.lot.aggregate({ where, _sum: { remainingQuantity: true } }))._sum.remainingQuantity ?? 0;
          await tx.lot.updateMany({ where, data: { storageLocationId: loc.id } });
        }
        const lotIds = await insertOwned(tx, userId, toAdd.map((t) => ({ variantId: t.variantId, quantity: 1 })), { cost: o.cost, acquiredOn: dayToDate(o.acquiredOn), storageLocationId: loc.id, market });
        return { lotIds, added: toAdd.length, moved, binder: loc.name };
      },
      { timeout: 30_000 },
    );
    refresh();
    const parts = [result.added ? `Added ${result.added} ${result.added === 1 ? "card" : "cards"}` : null, result.moved ? `moved ${result.moved} ${result.moved === 1 ? "card" : "cards"} you already had` : null].filter(Boolean);
    return { ok: true, data: result, message: `${parts.join(" and ") || "Nothing to change"}${result.binder ? ` — all in ${result.binder}` : ""}.` };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, message: e.message };
    throw e;
  }
}

const BinderCountsInput = z.object({
  setCode: z.string().min(1),
  scope: z.enum(["base", "all"]),
  cost: z.enum(["market", "zero"]),
  binder: BinderChoice,
  acquiredOn: day.refine(notInFuture, "The date can't be in the future"),
  counts: z.array(z.object({ key: z.string().min(1), count: z.number().int().min(0).max(999) })).min(1, "Nothing changed").max(2000),
});
export type BinderCountsPayload = z.input<typeof BinderCountsInput>;

/**
 * "Edit what I own" in the set binder: sets how many copies you have of each card. Raising a count
 * adds already-owned copies (normal finish where there is one, NM) into the chosen binder; lowering
 * it removes unsold copies — from that binder first, newest first.
 */
export async function saveBinderCounts(payload: BinderCountsPayload): Promise<Result<{ added: number; removed: number; binder: string | null; lotIds: string[] }>> {
  const parsed = BinderCountsInput.safeParse(payload);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const o = parsed.data;
  const userId = await getCurrentUserId();
  const set = await db.set.findUnique({ where: { code: o.setCode } });
  if (!set) return { ok: false, message: "That set isn't in the catalogue." };
  const held = await db.lot.findMany({ where: { userId, remainingQuantity: { gt: 0 } }, select: { variantId: true, remainingQuantity: true } });
  const ownedVariantIds = [...new Set(held.map((h) => h.variantId))];
  const slots = new Map((await loadSetSlots(db, set.id, o.scope, ownedVariantIds)).map((s) => [s.key, s]));
  const unknown = o.counts.find((c) => !slots.has(c.key));
  if (unknown) return { ok: false, message: "The set's card list changed — reload the page and try again." };

  try {
    const lots = await db.lot.findMany({ where: { userId, remainingQuantity: { gt: 0 }, variantId: { in: o.counts.flatMap((c) => slots.get(c.key)!.variantIds) } }, orderBy: [{ acquiredOn: "desc" }, { createdAt: "desc" }] });
    const plan = o.counts.map((c) => {
      const s = slots.get(c.key)!;
      const mine = lots.filter((l) => s.variantIds.includes(l.variantId));
      const have = mine.reduce((a, l) => a + l.remainingQuantity, 0);
      const addVariant = (s.printings.find((p) => p.finish === "NORMAL") ?? s.printings[0]).id;
      return { slot: s, mine, delta: c.count - have, addVariant };
    });
    const adds = plan.filter((p) => p.delta > 0);
    const market = await marketUnits(userId, adds.map((p) => p.addVariant));
    const result = await db.$transaction(
      async (tx) => {
        const loc = await resolveBinder(tx, userId, o.binder);
        let removed = 0;
        for (const p of plan.filter((x) => x.delta < 0)) {
          // From the chosen binder first, then anywhere; newest first within each.
          const ordered = [...p.mine.filter((l) => loc.id && l.storageLocationId === loc.id), ...p.mine.filter((l) => !loc.id || l.storageLocationId !== loc.id)];
          removed += await takeCopies(tx, ordered, -p.delta);
        }
        const lotIds = await insertOwned(tx, userId, adds.map((p) => ({ variantId: p.addVariant, quantity: p.delta })), { cost: o.cost, acquiredOn: dayToDate(o.acquiredOn), storageLocationId: loc.id, market });
        return { added: adds.reduce((a, p) => a + p.delta, 0), removed, binder: loc.name, lotIds };
      },
      { timeout: 30_000 },
    );
    refresh();
    const parts = [result.added ? `added ${result.added}` : null, result.removed ? `removed ${result.removed}` : null].filter(Boolean).join(" and ");
    return { ok: true, data: result, message: parts ? `Saved — ${parts} ${result.added + result.removed === 1 ? "copy" : "copies"}${result.added && result.binder ? ` (new copies in ${result.binder})` : ""}.` : "No changes to save." };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, message: e.message };
    throw e;
  }
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

const RemoveInput = z.object({ lotId: z.string().min(1), quantity: z.number().int().min(1, "Remove at least 1") });

/**
 * Takes copies out of your collection — added by mistake, given away or lost (a sale is "Record sale").
 * Only unsold copies; recorded sales keep their cost. An order left empty is deleted.
 */
export async function removeCopies(payload: z.input<typeof RemoveInput>): Promise<Result<{ removed: number }>> {
  const parsed = RemoveInput.safeParse(payload);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { lotId, quantity } = parsed.data;
  const userId = await getCurrentUserId();
  const lot = await db.lot.findFirst({ where: { id: lotId, userId } });
  if (!lot) return { ok: false, message: "Those copies are already gone — reload the page." };
  if (quantity > lot.remainingQuantity) return { ok: false, message: `Only ${lot.remainingQuantity} unsold ${lot.remainingQuantity === 1 ? "copy is" : "copies are"} left to remove.` };
  await db.$transaction((tx) => takeCopies(tx, [lot], quantity));
  refresh();
  return { ok: true, data: { removed: quantity }, message: `Removed ${quantity} ${quantity === 1 ? "copy" : "copies"} from your collection.` };
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
