"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUserId, isDemoMode } from "@/lib/currentUser";
import { quoteVariants } from "@/lib/prices/quote";
import type { Result } from "@/app/collection/actions";

/** Unit prices in the display currency — the same numbers card pages show. */
export async function quoteTrade(variantIds: string[]) {
  const userId = await getCurrentUserId();
  return quoteVariants(db, userId, await isDemoMode(), variantIds.slice(0, 500));
}

const ItemInput = z.object({
  kind: z.enum(["HAVE", "WANT"]),
  variantId: z.string().min(1, "Pick a card"),
  quantity: z.number().int().min(1, "At least 1").max(999),
  note: z.string().trim().max(200).optional(),
});

export async function addTradeItem(payload: z.input<typeof ItemInput>): Promise<Result> {
  const p = ItemInput.safeParse(payload);
  if (!p.success) return { ok: false, message: p.error.issues[0].message };
  const userId = await getCurrentUserId();
  if (!(await db.cardVariant.findUnique({ where: { id: p.data.variantId }, select: { id: true } }))) return { ok: false, message: "That card no longer exists." };
  await db.tradeListItem.upsert({
    where: { userId_kind_variantId: { userId, kind: p.data.kind, variantId: p.data.variantId } },
    update: { quantity: { increment: p.data.quantity }, ...(p.data.note ? { note: p.data.note } : {}) },
    create: { userId, ...p.data, note: p.data.note || null },
  });
  revalidatePath("/trade", "layout");
  return { ok: true, data: undefined };
}

export async function setTradeItemQty(id: string, quantity: number): Promise<Result> {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) return { ok: false, message: "Whole number, 0–999" };
  const userId = await getCurrentUserId();
  if (quantity === 0) await db.tradeListItem.deleteMany({ where: { id, userId } });
  else await db.tradeListItem.updateMany({ where: { id, userId }, data: { quantity } });
  revalidatePath("/trade", "layout");
  return { ok: true, data: undefined };
}

export async function setTradeSharing(on: boolean): Promise<Result<{ token: string | null }>> {
  const userId = await getCurrentUserId();
  const s = await db.settings.upsert({ where: { userId }, update: {}, create: { userId } });
  const token = on ? (s.tradeShareToken ?? randomBytes(12).toString("base64url")) : null;
  await db.settings.update({ where: { userId }, data: { tradeShareToken: token } });
  revalidatePath("/trade", "layout");
  return { ok: true, data: { token } };
}
