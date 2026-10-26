"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { CURRENCIES } from "@/lib/domain/enums";
import { evaluateWatches } from "@/lib/alerts/service";

export type Result<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; message: string; fieldErrors?: Record<string, string> };

const WatchInput = z
  .object({
    variantId: z.string().min(1),
    targetPrice: z.number().int().positive("Enter a price above zero").nullable(),
    targetDir: z.enum(["ABOVE", "BELOW"]),
    movePct: z.number().int().min(1, "1–100").max(100, "1–100").nullable(),
    currency: z.enum(CURRENCIES),
    preorderPrice: z.number().int().positive().nullable(),
    deckId: z.string().nullish(),
  })
  .refine((w) => w.targetPrice != null || w.movePct != null || w.preorderPrice != null, { message: "Set a target price, a % move, or a pre-order price.", path: ["targetPrice"] });
export type WatchPayload = z.input<typeof WatchInput>;

export async function saveWatch(payload: WatchPayload): Promise<Result<{ alerts: number }>> {
  const p = WatchInput.safeParse(payload);
  if (!p.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of p.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ok: false, message: p.error.issues[0].message, fieldErrors };
  }
  const userId = await getCurrentUserId();
  const w = p.data;
  if (!(await db.cardVariant.findUnique({ where: { id: w.variantId } }))) return { ok: false, message: "That printing no longer exists." };
  const deckId = w.deckId && (await db.deck.findFirst({ where: { id: w.deckId, userId } })) ? w.deckId : null;
  const data = { targetPrice: w.targetPrice, targetDir: w.targetPrice != null ? w.targetDir : null, movePct: w.movePct, currency: w.currency, preorderPrice: w.preorderPrice, deckId };
  const existing = await db.watchItem.findUnique({ where: { userId_variantId: { userId, variantId: w.variantId } } });
  // a changed target re-arms the crossing check
  const rearm = !existing || existing.targetPrice !== w.targetPrice || existing.targetDir !== data.targetDir || existing.currency !== w.currency;
  await db.watchItem.upsert({
    where: { userId_variantId: { userId, variantId: w.variantId } },
    update: { ...data, ...(rearm ? { lastSide: null } : {}) },
    create: { userId, variantId: w.variantId, ...data },
  });
  const alerts = await evaluateWatches(db, { userId, variantIds: [w.variantId] });
  revalidatePath("/", "layout");
  return { ok: true, data: { alerts }, message: alerts ? "Watching — and it's already past your target, so you have an alert." : "Watching." };
}

export async function removeWatch(variantId: string): Promise<Result> {
  const userId = await getCurrentUserId();
  await db.watchItem.deleteMany({ where: { userId, variantId } });
  revalidatePath("/", "layout");
  return { ok: true, data: undefined, message: "Stopped watching." };
}
