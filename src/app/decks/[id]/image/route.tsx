import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { dayKey } from "@/config/app";
import { deckLinesFromRows, loadBannedNames, loadDeckCards } from "@/lib/decks/data";
import { validateDeck } from "@/lib/decks/validate";
import { renderDeckImage } from "@/lib/decks/deckImage";
import { pipeSplit } from "@/lib/catalog/grouping";
import type { Section } from "@/lib/decks/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /decks/:id/image → PNG of the deck as a card grid (?download=1 to save it as a file)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  const deck = await db.deck.findFirst({
    where: { id, userId },
    include: { cards: { include: { card: true, preferredVariant: { select: { imageUrl: true } } } } },
  });
  if (!deck) return NextResponse.json({ error: "not found" }, { status: 404 });

  const lines = deckLinesFromRows(deck.cards);
  const cards = await loadDeckCards(db, [...new Set(lines.map((l) => l.cardId))]);
  const legal = validateDeck(lines, cards, { today: dayKey(), bannedNames: await loadBannedNames(db) }).legal;
  const legend = deck.cards.find((c) => c.section === "LEGEND");

  const image = await renderDeckImage({
    deckName: deck.name,
    legendName: legend?.card.name ?? null,
    legal,
    dateLabel: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }),
    cards: deck.cards.map((c) => ({
      cardId: c.cardId,
      section: c.section as Section,
      quantity: c.quantity,
      name: c.card.name,
      type: c.card.type,
      energy: c.card.energy,
      domains: pipeSplit(c.card.domains),
      imageUrl: c.preferredVariant?.imageUrl ?? c.card.imageUrl,
      landscape: c.card.orientation === "landscape",
    })),
  });
  const headers = new Headers(image.headers);
  headers.set("cache-control", "no-store");
  if (new URL(req.url).searchParams.get("download")) {
    const file = deck.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "deck";
    headers.set("content-disposition", `attachment; filename="${file}.png"`);
  }
  return new Response(image.body, { status: 200, headers });
}
