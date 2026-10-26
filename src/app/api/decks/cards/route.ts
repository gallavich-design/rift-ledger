import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { getFx, getSettings } from "@/lib/portfolio/data";
import { loadDeckCards, loadDeckPricing, loadOwned } from "@/lib/decks/data";

// Card facts + prices + owned counts for cards being added in the deck editor: ?ids=a,b
export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 50);
  if (!ids.length) return NextResponse.json({ cards: [], pricing: [], owned: [] });
  const userId = await getCurrentUserId();
  const settings = await getSettings(db, userId);
  const fx = await getFx(db, settings.fxOverrides);
  const [cards, pricing, owned] = await Promise.all([
    loadDeckCards(db, ids),
    loadDeckPricing(db, userId, ids, settings.defaultValuationSource, fx.table, settings.displayCurrency),
    loadOwned(db, userId, ids),
  ]);
  return NextResponse.json({ cards: [...cards.values()], pricing: [...pricing.values()], owned: [...owned.entries()] });
}
