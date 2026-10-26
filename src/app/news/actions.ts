"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { createRuling, deleteRuling, RULING_TYPES } from "@/lib/rulings/service";

export type Result<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; message: string; fieldErrors?: Record<string, string> };

const RulingInput = z
  .object({
    type: z.enum(RULING_TYPES),
    title: z.string().trim().min(1, "Give it a title, e.g. “Ban list update”.").max(160),
    effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date it takes effect"),
    summary: z.string().trim().max(2000).optional(),
    oldText: z.string().trim().max(2000).optional(),
    newText: z.string().trim().max(2000).optional(),
    sourceUrl: z.union([z.literal(""), z.string().trim().url("Enter a full link starting with https://")]).optional(),
    cardIds: z.array(z.string().min(1)).max(100),
    setCode: z.string().trim().optional(),
  })
  .superRefine((r, ctx) => {
    if (r.type === "ROTATION" && !r.setCode) ctx.addIssue({ code: "custom", path: ["setCode"], message: "Pick the set that rotates." });
    if (r.type !== "ROTATION" && r.cardIds.length === 0) ctx.addIssue({ code: "custom", path: ["cardIds"], message: "Add at least one card." });
    if (r.type === "ERRATA" && !r.newText) ctx.addIssue({ code: "custom", path: ["newText"], message: "Enter the new rules text." });
  });
export type RulingPayload = z.input<typeof RulingInput>;

export async function addRuling(payload: RulingPayload): Promise<Result<{ rulingId: string; alerts: number }>> {
  const p = RulingInput.safeParse(payload);
  if (!p.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of p.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }
  if (p.data.setCode && !(await db.set.findUnique({ where: { code: p.data.setCode } }))) return { ok: false, message: "That set doesn't exist.", fieldErrors: { setCode: "Unknown set" } };
  const found = await db.card.count({ where: { id: { in: p.data.cardIds } } });
  if (found !== new Set(p.data.cardIds).size) return { ok: false, message: "A selected card no longer exists." };
  const { ruling, alerts } = await createRuling(db, { ...p.data, setCode: p.data.setCode ?? null });
  revalidatePath("/", "layout");
  return { ok: true, data: { rulingId: ruling.id, alerts }, message: alerts ? `Saved. ${alerts} alert${alerts === 1 ? "" : "s"} sent.` : "Saved. None of your cards are affected." };
}

export async function removeRuling(id: string): Promise<Result> {
  await deleteRuling(db, id);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function markAlertRead(id: string, read = true): Promise<void> {
  const userId = await getCurrentUserId();
  await db.alert.updateMany({ where: { id, userId }, data: { read } });
  revalidatePath("/", "layout");
}

export async function markAllRead(): Promise<void> {
  const userId = await getCurrentUserId();
  await db.alert.updateMany({ where: { userId, read: false }, data: { read: true } });
  revalidatePath("/", "layout");
}
