import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { getFx, getSettings } from "@/lib/portfolio/data";
import { loadDeckPricing } from "@/lib/decks/data";
import { toCsv, toText, type ExportLine } from "@/lib/decks/exportList";
import { formatMoney } from "@/lib/money/money";
import type { Section } from "@/lib/decks/types";

// GET /decks/:id/export?format=txt|csv — or with ?share=<token> for a shared deck (txt only)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "txt";
  const share = url.searchParams.get("share");
  const userId = await getCurrentUserId();
  const deck = await db.deck.findFirst({
    where: share ? { id, shareToken: share } : { id, userId },
    include: { cards: { include: { card: { select: { name: true } }, preferredVariant: { include: { set: { select: { code: true } } } } } } },
  });
  if (!deck) return NextResponse.json({ error: "not found" }, { status: 404 });

  let pricing = new Map();
  let currency = "THB";
  if (format === "csv" && !share) {
    const settings = await getSettings(db, userId);
    const fx = await getFx(db, settings.fxOverrides);
    currency = settings.displayCurrency;
    pricing = await loadDeckPricing(db, userId, [...new Set(deck.cards.map((c) => c.cardId))], settings.defaultValuationSource, fx.table, currency);
  }

  const lines: ExportLine[] = deck.cards.map((c) => {
    const pr = pricing.get(c.cardId);
    const v = pr?.variants.find((x: { variantId: string }) => x.variantId === (c.preferredVariantId ?? pr.defaultVariantId));
    return {
      section: c.section as Section,
      quantity: c.quantity,
      name: c.card.name,
      setCode: c.preferredVariant?.set.code,
      collectorNumber: c.preferredVariant?.collectorNumber,
      printing: v?.label,
      unitPrice: v?.unit != null ? formatMoney(v.unit, currency) : undefined,
      proxies: c.proxyQuantity,
    };
  });
  const safe = deck.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "deck";
  const body = format === "csv" ? toCsv(lines) : toText(deck.name, lines);
  return new NextResponse(body, {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safe}.${format}"`,
    },
  });
}
