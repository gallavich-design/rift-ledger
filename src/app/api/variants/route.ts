import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ART_LABEL, type VariantArt } from "@/lib/domain/enums";

// Variants for the purchase / sale pickers: ?card=<cardId> or ?ids=a,b
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cardId = url.searchParams.get("card");
  const ids = url.searchParams.get("ids")?.split(",").filter(Boolean);
  if (!cardId && !ids?.length) return NextResponse.json({ variants: [] });

  const variants = await db.cardVariant.findMany({
    where: cardId ? { cardId } : { id: { in: ids! } },
    include: {
      card: { select: { name: true, orientation: true, domains: true } },
      set: { select: { code: true, name: true, releaseDate: true } },
      priceSnapshots: { where: { source: "TCGPLAYER" }, orderBy: { day: "desc" }, take: 1 },
    },
  });
  variants.sort(
    (a, b) =>
      (a.set.releaseDate?.getTime() ?? 0) - (b.set.releaseDate?.getTime() ?? 0) ||
      (a.collectorNumber ?? 0) - (b.collectorNumber ?? 0) ||
      a.finish.localeCompare(b.finish),
  );
  return NextResponse.json({
    variants: variants.map((v) => ({
      id: v.id,
      cardId: v.cardId,
      name: v.card.name,
      domains: v.card.domains,
      orientation: v.card.orientation,
      setCode: v.set.code,
      setName: v.set.name,
      collectorNumber: v.collectorNumber,
      art: ART_LABEL[v.art as VariantArt] ?? v.art,
      finish: v.finish,
      language: v.language,
      graded: v.gradingCompany ? `${v.gradingCompany} ${v.grade ?? ""}`.trim() : null,
      rarity: v.rarity,
      imageUrl: v.imageUrl,
      tcgMarket: v.priceSnapshots[0]?.market ?? null, // USD cents
      tcgDay: v.priceSnapshots[0]?.day ?? null,
    })),
  });
}
