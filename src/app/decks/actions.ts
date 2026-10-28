"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { dayKey, dayToDate } from "@/config/app";
import { getSearchIndex } from "@/lib/catalog/search";
import { parseDecklistText } from "@/lib/decks/parse";
import { resolveDecklist, sectionFor, type UnrecognizedLine } from "@/lib/decks/resolve";
import { diffSnapshots, type SnapshotLine } from "@/lib/decks/diff";
import { deckLinesFromRows, loadDeckPricing, loadOwned, toSnapshot } from "@/lib/decks/data";
import { ownershipShortfall } from "@/lib/decks/cost";
import { getFx, getSettings, missingRates } from "@/lib/portfolio/data";
import { SECTIONS, type DeckLine } from "@/lib/decks/types";

export type Result<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; message: string; fieldErrors?: Record<string, string> };

const LineInput = z.object({
  cardId: z.string().min(1),
  section: z.enum(SECTIONS),
  quantity: z.number().int().min(0).max(99),
  proxyQuantity: z.number().int().min(0).max(99),
  preferredVariantId: z.string().nullish(),
});

async function ownDeck(deckId: string) {
  const userId = await getCurrentUserId();
  const deck = await db.deck.findFirst({ where: { id: deckId, userId } });
  if (!deck) throw new Error("That deck no longer exists.");
  return { userId, deck };
}

function sameSnapshot(a: SnapshotLine[], b: SnapshotLine[]) {
  const k = (s: SnapshotLine[]) => JSON.stringify(s.map((l) => [l.section, l.cardId, l.quantity, l.proxyQuantity, l.preferredVariantId ?? null]));
  return k(a) === k(b);
}

/** Replace a deck's list and record a version when anything changed. Shared by every editing path. */
async function writeDeckLines(deckId: string, lines: DeckLine[]): Promise<{ version: number | null }> {
  // merge duplicates (same card + section) and drop zero rows
  const merged = new Map<string, DeckLine>();
  for (const l of lines) {
    if (l.quantity <= 0) continue;
    const k = `${l.section}|${l.cardId}`;
    const cur = merged.get(k);
    if (cur) cur.quantity += l.quantity;
    else merged.set(k, { ...l, proxyQuantity: Math.min(l.proxyQuantity, l.quantity) });
  }
  const clean = [...merged.values()];
  const cardIds = [...new Set(clean.map((l) => l.cardId))];
  const cards = await db.card.findMany({ where: { id: { in: cardIds } }, select: { id: true, name: true } });
  if (cards.length !== cardIds.length) throw new Error("A card in this deck no longer exists in the catalogue.");
  const names = new Map(cards.map((c) => [c.id, c.name]));
  const snapshot = toSnapshot(clean, names);

  return db.$transaction(async (tx) => {
    const last = await tx.deckVersion.findFirst({ where: { deckId }, orderBy: { version: "desc" } });
    const prev: SnapshotLine[] = last ? JSON.parse(last.snapshot) : [];
    await tx.deckCard.deleteMany({ where: { deckId } });
    if (clean.length) {
      await tx.deckCard.createMany({
        data: clean.map((l) => ({ deckId, cardId: l.cardId, section: l.section, quantity: l.quantity, proxyQuantity: l.proxyQuantity, preferredVariantId: l.preferredVariantId ?? null })),
      });
    }
    await tx.deck.update({ where: { id: deckId }, data: { updatedAt: new Date() } });
    if (last && sameSnapshot(prev, snapshot)) return { version: null };
    const version = (last?.version ?? 0) + 1;
    await tx.deckVersion.create({
      data: { deckId, version, snapshot: JSON.stringify(snapshot), diff: JSON.stringify(last ? diffSnapshots(prev, snapshot) : []) },
    });
    return { version };
  });
}

function refresh(deckId?: string) {
  revalidatePath("/decks");
  if (deckId) revalidatePath(`/decks/${deckId}`);
  revalidatePath("/cards", "layout");
}

// ───────────────────────────── create / import ─────────────────────────────

const Name = z.string().trim().min(1, "Give the deck a name.").max(80, "Keep the name under 80 characters.");

export async function createDeck(payload: { name: string }): Promise<Result<{ deckId: string }>> {
  const n = Name.safeParse(payload.name);
  if (!n.success) return { ok: false, message: n.error.issues[0].message, fieldErrors: { name: n.error.issues[0].message } };
  const userId = await getCurrentUserId();
  const deck = await db.deck.create({ data: { userId, name: n.data } });
  await db.deckVersion.create({ data: { deckId: deck.id, version: 1, snapshot: "[]", diff: "[]" } });
  refresh();
  return { ok: true, data: { deckId: deck.id } };
}

export async function importDeck(payload: { name: string; text: string }): Promise<Result<{ deckId: string; matched: number; unrecognized: number }>> {
  const n = Name.safeParse(payload.name);
  if (!n.success) return { ok: false, message: n.error.issues[0].message, fieldErrors: { name: n.error.issues[0].message } };
  if (!payload.text.trim()) return { ok: false, message: "Paste a decklist first.", fieldErrors: { text: "Paste a decklist first." } };
  if (payload.text.length > 20_000) return { ok: false, message: "That list is too long.", fieldErrors: { text: "That list is too long." } };
  const parsed = parseDecklistText(payload.text);
  if (!parsed.length) return { ok: false, message: "No card lines found.", fieldErrors: { text: "No card lines found — one card per line, e.g. “3 Jinx - Loose Cannon”." } };
  const r = resolveDecklist(parsed, await getSearchIndex(db));
  const userId = await getCurrentUserId();
  const deck = await db.deck.create({ data: { userId, name: n.data, pendingImportLines: JSON.stringify(r.unrecognized) } });
  await writeDeckLines(deck.id, r.lines);
  refresh(deck.id);
  return { ok: true, data: { deckId: deck.id, matched: r.matched.length, unrecognized: r.unrecognized.length } };
}

// ───────────────────────────── edit ─────────────────────────────

export async function saveDeck(payload: { deckId: string; name: string; notes?: string; lines: DeckLine[] }): Promise<Result<{ version: number | null }>> {
  const n = Name.safeParse(payload.name);
  if (!n.success) return { ok: false, message: n.error.issues[0].message, fieldErrors: { name: n.error.issues[0].message } };
  const lines = z.array(LineInput).max(300).safeParse(payload.lines);
  if (!lines.success) return { ok: false, message: "Something in the list is invalid — reload and try again." };
  try {
    const { deck } = await ownDeck(payload.deckId);
    await db.deck.update({ where: { id: deck.id }, data: { name: n.data, notes: payload.notes?.trim() || null } });
    const r = await writeDeckLines(deck.id, lines.data);
    refresh(deck.id);
    return { ok: true, data: r, message: r.version ? `Saved as version ${r.version}.` : "Saved." };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Fix or dismiss a line an import couldn't match. */
export async function resolveImportLine(payload: { deckId: string; lineNo: number; cardId: string | null }): Promise<Result> {
  try {
    const { deck } = await ownDeck(payload.deckId);
    const pending: UnrecognizedLine[] = JSON.parse(deck.pendingImportLines);
    const line = pending.find((p) => p.lineNo === payload.lineNo);
    if (!line) return { ok: false, message: "That line was already handled." };
    if (payload.cardId) {
      const card = await db.card.findUnique({ where: { id: payload.cardId }, select: { id: true, type: true } });
      if (!card) return { ok: false, message: "That card no longer exists." };
      const rows = await db.deckCard.findMany({ where: { deckId: deck.id } });
      const lines: DeckLine[] = rows.map((r) => ({ cardId: r.cardId, section: r.section as DeckLine["section"], quantity: r.quantity, proxyQuantity: r.proxyQuantity, preferredVariantId: r.preferredVariantId }));
      lines.push({ cardId: card.id, section: sectionFor(card, line.sectionHint), quantity: line.quantity, proxyQuantity: 0 });
      await writeDeckLines(deck.id, lines);
    }
    await db.deck.update({ where: { id: deck.id }, data: { pendingImportLines: JSON.stringify(pending.filter((p) => p.lineNo !== payload.lineNo)) } });
    refresh(deck.id);
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** From a card page: add copies to the right section of a deck. */
export async function addCardToDeck(payload: { deckId: string; cardId: string; quantity: number }): Promise<Result<{ version: number | null }>> {
  try {
    const { deck } = await ownDeck(payload.deckId);
    const card = await db.card.findUnique({ where: { id: payload.cardId }, select: { id: true, type: true, name: true } });
    if (!card) return { ok: false, message: "That card no longer exists." };
    const q = Math.max(1, Math.min(3, Math.floor(payload.quantity || 1)));
    const rows = await db.deckCard.findMany({ where: { deckId: deck.id } });
    const lines: DeckLine[] = rows.map((r) => ({ cardId: r.cardId, section: r.section as DeckLine["section"], quantity: r.quantity, proxyQuantity: r.proxyQuantity, preferredVariantId: r.preferredVariantId }));
    lines.push({ cardId: card.id, section: sectionFor(card, null), quantity: q, proxyQuantity: 0 });
    const r = await writeDeckLines(deck.id, lines);
    refresh(deck.id);
    return { ok: true, data: r, message: `Added ${q}× ${card.name} to ${deck.name}.` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function deleteDeck(deckId: string): Promise<Result> {
  try {
    const { deck } = await ownDeck(deckId);
    await db.deck.delete({ where: { id: deck.id } });
    refresh();
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function restoreVersion(payload: { deckId: string; version: number }): Promise<Result<{ version: number | null }>> {
  try {
    const { deck } = await ownDeck(payload.deckId);
    const v = await db.deckVersion.findUnique({ where: { deckId_version: { deckId: deck.id, version: payload.version } } });
    if (!v) return { ok: false, message: "That version no longer exists." };
    const snap: SnapshotLine[] = JSON.parse(v.snapshot);
    const r = await writeDeckLines(deck.id, snap.map((s) => ({ cardId: s.cardId, section: s.section, quantity: s.quantity, proxyQuantity: s.proxyQuantity, preferredVariantId: s.preferredVariantId ?? null })));
    refresh(deck.id);
    return { ok: true, data: r, message: r.version ? `Restored version ${payload.version} as version ${r.version}.` : "Already the current list." };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// ───────────────────────────── share ─────────────────────────────

export async function setSharing(payload: { deckId: string; on: boolean }): Promise<Result<{ token: string | null }>> {
  try {
    const { deck } = await ownDeck(payload.deckId);
    const token = payload.on ? (deck.shareToken ?? randomBytes(12).toString("base64url")) : null;
    await db.deck.update({ where: { id: deck.id }, data: { shareToken: token } });
    refresh(deck.id);
    return { ok: true, data: { token } };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// ───────────────────────────── match log ─────────────────────────────

const MatchInput = z.object({
  deckId: z.string().min(1),
  opponentLegend: z.string().trim().min(1, "Which Legend did they play?").max(80),
  result: z.enum(["WIN", "LOSS", "DRAW"]),
  eventType: z.enum(["CASUAL", "LOCAL", "STORE", "REGIONAL", "ONLINE", "OTHER"]),
  playedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date").refine((d) => d <= dayKey(), "That date is in the future"),
  notes: z.string().trim().max(500).optional(),
});
export type MatchPayload = z.input<typeof MatchInput>;

export async function logMatch(payload: MatchPayload): Promise<Result> {
  const p = MatchInput.safeParse(payload);
  if (!p.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of p.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }
  try {
    const { userId, deck } = await ownDeck(p.data.deckId);
    await db.matchResult.create({
      data: { userId, deckId: deck.id, opponentLegend: p.data.opponentLegend, result: p.data.result, eventType: p.data.eventType, playedOn: dayToDate(p.data.playedOn), notes: p.data.notes || null },
    });
    refresh(deck.id);
    return { ok: true, data: undefined, message: "Match logged." };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function deleteMatch(matchId: string): Promise<Result> {
  const userId = await getCurrentUserId();
  const m = await db.matchResult.findFirst({ where: { id: matchId, userId } });
  if (!m) return { ok: false, message: "That match no longer exists." };
  await db.matchResult.delete({ where: { id: m.id } });
  refresh(m.deckId);
  return { ok: true, data: undefined };
}

// ───────────────────────────── I own all of these ─────────────────────────────

const MarkOwnedInput = z.object({
  deckId: z.string().min(1),
  includeProxies: z.boolean(),
  cost: z.enum(["market", "zero"]),
  acquiredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date").refine((d) => d <= dayKey(), "The date can't be in the future"),
});
export type MarkOwnedPayload = z.input<typeof MarkOwnedInput>;

/**
 * Adds the copies this deck needs that you don't own yet, as one order ("From deck: …"), so the
 * collection covers the deck. Works from the saved deck. Undo = delete that order.
 */
export async function markDeckOwned(payload: MarkOwnedPayload): Promise<Result<{ orderId: string | null; copies: number; cards: number }>> {
  const parsed = MarkOwnedInput.safeParse(payload);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const o = parsed.data;
  const userId = await getCurrentUserId();
  const deck = await db.deck.findFirst({ where: { id: o.deckId, userId }, include: { cards: true } });
  if (!deck) return { ok: false, message: "That deck no longer exists." };

  const settings = await getSettings(db, userId);
  const fx = await getFx(db, settings.fxOverrides);
  const display = settings.displayCurrency;
  if (missingRates(fx.table, [display]).length) return { ok: false, message: `No exchange rate for ${display} yet — set one in Settings.` };
  const lines = deckLinesFromRows(deck.cards);
  const cardIds = [...new Set(lines.map((l) => l.cardId))];
  const [pricing, owned] = await Promise.all([loadDeckPricing(db, userId, cardIds, settings.defaultValuationSource, fx.table, display), loadOwned(db, userId, cardIds)]);
  const short = ownershipShortfall(lines, owned, pricing, o.includeProxies).filter((s) => s.variantId);
  const clearProxies = o.includeProxies && deck.cards.some((c) => c.proxyQuantity > 0);
  if (!short.length && !clearProxies) return { ok: true, data: { orderId: null, copies: 0, cards: 0 }, message: "You already own every card in this deck." };

  const acquiredOn = dayToDate(o.acquiredOn);
  const orderId = await db.$transaction(async (tx) => {
    let id: string | null = null;
    if (short.length) {
      const order = await tx.order.create({
        data: { userId, orderedOn: acquiredOn, seller: `From deck: ${deck.name}`.slice(0, 120), currency: display, notes: "Added with “I own all of these” on the deck page." },
      });
      id = order.id;
      for (const s of short) {
        const unit = o.cost === "market" ? (s.unit ?? 0) : 0;
        await tx.lot.create({
          data: {
            userId,
            orderId: order.id,
            variantId: s.variantId!,
            quantity: s.add,
            remainingQuantity: s.add,
            unitPrice: unit,
            landedUnitCost: unit,
            landedTotal: unit * s.add,
            currency: display,
            condition: "NM",
            acquiredOn,
            notes: o.cost === "market" ? (s.unit != null ? "cost = market price when marked owned" : "no price — cost 0") : "cost not recorded",
          },
        });
      }
    }
    if (clearProxies) await tx.deckCard.updateMany({ where: { deckId: deck.id }, data: { proxyQuantity: 0 } });
    return id;
  });
  revalidatePath(`/decks/${deck.id}`);
  revalidatePath("/decks");
  revalidatePath("/dashboard");
  revalidatePath("/collection", "layout");
  revalidatePath("/cards", "layout");
  const copies = short.reduce((a, s) => a + s.add, 0);
  return { ok: true, data: { orderId, copies, cards: short.length } };
}
