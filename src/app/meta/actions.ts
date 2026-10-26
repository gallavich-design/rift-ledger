"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { dayKey, dayToDate } from "@/config/app";
import { getSearchIndex } from "@/lib/catalog/search";
import { parseDecklistText } from "@/lib/decks/parse";
import { resolveDecklist, sectionFor, type UnrecognizedLine } from "@/lib/decks/resolve";
import { toSnapshot } from "@/lib/decks/data";

export type Result<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; message: string; fieldErrors?: Record<string, string> };

const MetaInput = z.object({
  event: z.string().trim().min(1, "Which event?").max(120),
  placement: z.string().trim().max(40).optional(),
  playedOn: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date").refine((d) => d <= dayKey(), "That date is in the future")]).optional(),
  archetype: z.string().trim().min(1, "Name the archetype, e.g. “Jinx aggro”.").max(80),
  sourceUrl: z.union([z.literal(""), z.string().trim().url("Enter a full link starting with https://")]).optional(),
  text: z.string().min(1, "Paste the decklist.").max(20_000, "That list is too long."),
});
export type MetaPayload = z.input<typeof MetaInput>;

export async function importMeta(payload: MetaPayload): Promise<Result<{ metaId: string; unrecognized: number }>> {
  const p = MetaInput.safeParse(payload);
  if (!p.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of p.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }
  const parsed = parseDecklistText(p.data.text);
  if (!parsed.length) return { ok: false, message: "No card lines found.", fieldErrors: { text: "No card lines found — one card per line, e.g. “3 Jinx - Loose Cannon”." } };
  const r = resolveDecklist(parsed, await getSearchIndex(db));
  const userId = await getCurrentUserId();
  const meta = await db.metaDeck.create({
    data: {
      userId,
      event: p.data.event,
      placement: p.data.placement || null,
      playedOn: p.data.playedOn ? dayToDate(p.data.playedOn) : null,
      archetype: p.data.archetype,
      sourceUrl: p.data.sourceUrl || null,
      pendingImportLines: JSON.stringify(r.unrecognized),
      cards: { create: r.lines.map((l) => ({ cardId: l.cardId, section: l.section, quantity: l.quantity })) },
    },
  });
  revalidatePath("/meta");
  return { ok: true, data: { metaId: meta.id, unrecognized: r.unrecognized.length } };
}

async function ownMeta(id: string) {
  const userId = await getCurrentUserId();
  const meta = await db.metaDeck.findFirst({ where: { id, userId }, include: { cards: true } });
  if (!meta) throw new Error("That meta deck no longer exists.");
  return { userId, meta };
}

export async function resolveMetaLine(payload: { metaId: string; lineNo: number; cardId: string | null }): Promise<Result> {
  try {
    const { meta } = await ownMeta(payload.metaId);
    const pending: UnrecognizedLine[] = JSON.parse(meta.pendingImportLines);
    const line = pending.find((l) => l.lineNo === payload.lineNo);
    if (!line) return { ok: false, message: "That line was already handled." };
    if (payload.cardId) {
      const card = await db.card.findUnique({ where: { id: payload.cardId }, select: { id: true, type: true } });
      if (!card) return { ok: false, message: "That card no longer exists." };
      await db.metaDeckCard.create({ data: { metaDeckId: meta.id, cardId: card.id, section: sectionFor(card, line.sectionHint), quantity: line.quantity } });
    }
    await db.metaDeck.update({ where: { id: meta.id }, data: { pendingImportLines: JSON.stringify(pending.filter((l) => l.lineNo !== payload.lineNo)) } });
    revalidatePath("/meta", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function deleteMeta(id: string): Promise<Result> {
  try {
    const { meta } = await ownMeta(id);
    await db.metaDeck.delete({ where: { id: meta.id } });
    revalidatePath("/meta", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** One click: the meta list becomes one of your decks (version 1). */
export async function copyMetaToDecks(id: string): Promise<Result<{ deckId: string }>> {
  try {
    const { userId, meta } = await ownMeta(id);
    const names = new Map((await db.card.findMany({ where: { id: { in: meta.cards.map((c) => c.cardId) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
    const merged = new Map<string, { cardId: string; section: string; quantity: number }>();
    for (const c of meta.cards) {
      const k = `${c.section}|${c.cardId}`;
      const cur = merged.get(k);
      if (cur) cur.quantity += c.quantity;
      else merged.set(k, { cardId: c.cardId, section: c.section, quantity: c.quantity });
    }
    const lines = [...merged.values()].map((l) => ({ ...l, section: l.section as "MAIN", proxyQuantity: 0, preferredVariantId: null }));
    const deck = await db.deck.create({
      data: {
        userId,
        name: `${meta.archetype} — ${meta.event}`.slice(0, 80),
        notes: `Copied from ${meta.event}${meta.placement ? `, ${meta.placement}` : ""}.`,
        cards: { create: lines.map((l) => ({ cardId: l.cardId, section: l.section, quantity: l.quantity })) },
        versions: { create: { version: 1, snapshot: JSON.stringify(toSnapshot(lines, names)), diff: "[]" } },
      },
    });
    revalidatePath("/decks");
    return { ok: true, data: { deckId: deck.id } };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
