"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { DEMO_COOKIE, getCurrentUserId } from "@/lib/currentUser";
import { CONDITIONS, CURRENCIES, STORAGE_TYPES } from "@/lib/domain/enums";
import { runPriceJob } from "@/lib/prices/job";
import { clearDemo, seedDemo } from "@/lib/demo/seed";
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

// ───────────────────────────── Money settings ─────────────────────────────

const MoneyInput = z.object({
  displayCurrency: z.enum(CURRENCIES),
  defaultValuationSource: z.enum(["TCGPLAYER", "LOCAL", "CARDMARKET", "DEMO"]),
  fxTHB: z.string().trim(),
  fxEUR: z.string().trim(),
  multipliers: z.record(z.enum(CONDITIONS), z.number().int().min(0, "0–100").max(100, "0–100")),
});
export type MoneyPayload = z.input<typeof MoneyInput>;

/** "33.75" → 33_750_000. Empty → null (use the daily rate). */
function parseRate(s: string): number | null | "invalid" {
  if (!s) return null;
  if (!/^\d{1,6}(\.\d{1,6})?$/.test(s)) return "invalid";
  const [w, f = ""] = s.split(".");
  const v = Number(w) * 1_000_000 + Number((f + "000000").slice(0, 6));
  return v > 0 ? v : "invalid";
}

export async function saveMoneySettings(payload: MoneyPayload): Promise<ActionState> {
  const parsed = MoneyInput.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] ??= i.message;
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }
  const m = parsed.data;
  const fxOverrides: Record<string, number> = {};
  const fieldErrors: Record<string, string> = {};
  for (const [q, raw] of [["THB", m.fxTHB], ["EUR", m.fxEUR]] as const) {
    const r = parseRate(raw);
    if (r === "invalid") fieldErrors[`fx${q}`] = "Enter a rate like 33.75";
    else if (r != null) fxOverrides[q] = r;
  }
  if (Object.keys(fieldErrors).length) return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  const userId = await getCurrentUserId();
  await db.settings.upsert({
    where: { userId },
    update: { displayCurrency: m.displayCurrency, defaultValuationSource: m.defaultValuationSource, fxOverrides: JSON.stringify(fxOverrides), conditionMultipliers: JSON.stringify(m.multipliers) },
    create: { userId, displayCurrency: m.displayCurrency, defaultValuationSource: m.defaultValuationSource, fxOverrides: JSON.stringify(fxOverrides), conditionMultipliers: JSON.stringify(m.multipliers) },
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

export async function runPriceSync(): Promise<ActionState> {
  try {
    const r = await runPriceJob(db);
    revalidatePath("/", "layout");
    return { ok: true, message: `Prices for ${r.day}: ${r.snapshots.toLocaleString("en-US")} printings priced.${r.warnings.length ? " " + r.warnings.join(" ") : ""}` };
  } catch (e) {
    return { ok: false, message: `Price update failed: ${(e as Error).message}` };
  }
}

// ───────────────────────────── Demo data ─────────────────────────────

export async function loadDemoData(): Promise<ActionState> {
  try {
    const r = await seedDemo(db);
    (await cookies()).set(DEMO_COOKIE, "1", { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 30 });
    revalidatePath("/", "layout");
    return { ok: true, message: `Demo loaded: ${r.cards} cards with ${r.days} days of history.` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function exitDemo(): Promise<void> {
  (await cookies()).delete(DEMO_COOKIE);
  revalidatePath("/", "layout");
}

export async function enterDemo(): Promise<void> {
  (await cookies()).set(DEMO_COOKIE, "1", { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 30 });
  revalidatePath("/", "layout");
}

export async function deleteDemoData(): Promise<ActionState> {
  await clearDemo(db);
  (await cookies()).delete(DEMO_COOKIE);
  revalidatePath("/", "layout");
  return { ok: true, message: "Demo data deleted." };
}
