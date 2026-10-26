import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { searchCards } from "@/lib/catalog/search";
import { getCurrentUserId } from "@/lib/currentUser";
import { normalizeForSearch } from "@/lib/catalog/grouping";

// Global search (⌘K): cards, sets, storage locations. Decks join in Phase 3.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ cards: [], sets: [], locations: [] });

  const userId = await getCurrentUserId();
  const norm = normalizeForSearch(q);
  const [cards, sets, locations] = await Promise.all([
    searchCards(db, q, 8),
    db.set.findMany({ orderBy: { releaseDate: "desc" } }),
    db.storageLocation.findMany({ where: { userId }, orderBy: { name: "asc" } }),
  ]);

  return NextResponse.json({
    cards: cards.map((c) => ({ id: c.id, name: c.name, type: c.type, setCode: c.setCode, imageUrl: c.imageUrl, domains: c.domains })),
    sets: sets
      .filter((s) => normalizeForSearch(s.name).includes(norm) || s.code.toLowerCase() === norm)
      .slice(0, 4)
      .map((s) => ({ code: s.code, name: s.name })),
    locations: locations
      .filter((l) => normalizeForSearch(l.name).includes(norm))
      .slice(0, 4)
      .map((l) => ({ id: l.id, name: l.name })),
  });
}
