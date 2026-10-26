"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { STORAGE_TYPES } from "@/lib/domain/enums";
import { syncCatalog } from "@/lib/catalog/sync";
import { riftcodex } from "@/lib/providers/riftcodex";

export interface ActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

const LocationInput = z.object({
  name: z.string().trim().min(1, "Give the location a name.").max(80, "Keep the name under 80 characters."),
  type: z.enum(STORAGE_TYPES, { message: "Pick a type." }),
  notes: z
    .string()
    .trim()
    .max(500, "Notes are limited to 500 characters.")
    .transform((v) => v || null),
});

function parse(form: FormData) {
  const r = LocationInput.safeParse({
    name: form.get("name") ?? "",
    type: form.get("type") ?? "",
    notes: form.get("notes") ?? "",
  });
  if (r.success) return { data: r.data } as const;
  const fieldErrors: Record<string, string> = {};
  for (const issue of r.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
  return { fieldErrors } as const;
}

const duplicate = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export async function createLocation(_: ActionState, form: FormData): Promise<ActionState> {
  const userId = await getCurrentUserId();
  const p = parse(form);
  if (!p.data) return { ok: false, fieldErrors: p.fieldErrors };
  try {
    await db.storageLocation.create({ data: { ...p.data, userId } });
  } catch (e) {
    if (duplicate(e)) return { ok: false, fieldErrors: { name: "You already have a location with this name." } };
    throw e;
  }
  revalidatePath("/settings");
  return { ok: true, message: `Added “${p.data.name}”.` };
}

export async function updateLocation(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const userId = await getCurrentUserId();
  const p = parse(form);
  if (!p.data) return { ok: false, fieldErrors: p.fieldErrors };
  try {
    const r = await db.storageLocation.updateMany({ where: { id, userId }, data: p.data });
    if (r.count === 0) return { ok: false, message: "That location no longer exists." };
  } catch (e) {
    if (duplicate(e)) return { ok: false, fieldErrors: { name: "You already have a location with this name." } };
    throw e;
  }
  revalidatePath("/settings");
  return { ok: true, message: "Saved." };
}

export async function deleteLocation(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  // Lots keep existing; their location becomes "unassigned" (onDelete: SetNull).
  await db.storageLocation.deleteMany({ where: { id, userId } });
  revalidatePath("/settings");
}

export async function runCatalogSync(): Promise<ActionState> {
  try {
    const r = await syncCatalog(db, riftcodex);
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `Synced ${r.sets} sets, ${r.cards.toLocaleString("en-US")} cards and ${r.variants.toLocaleString("en-US")} printings.`,
    };
  } catch (e) {
    return { ok: false, message: `Sync failed: ${(e as Error).message}` };
  }
}
