import type { Card, CardVariant, Set } from "@prisma/client";
import { ART_LABEL, type VariantArt } from "@/lib/domain/enums";
import type { PickedVariant } from "@/components/cards/VariantPicker";

/** DB variant → the shape the client-side pickers use. */
export function toPicked(v: CardVariant & { card: Card; set: Set }): PickedVariant {
  return {
    id: v.id,
    cardId: v.cardId,
    name: v.card.name,
    domains: v.card.domains,
    setCode: v.set.code,
    setName: v.set.name,
    collectorNumber: v.collectorNumber,
    art: ART_LABEL[v.art as VariantArt] ?? v.art,
    finish: v.finish,
    language: v.language,
    graded: v.gradingCompany ? `${v.gradingCompany} ${v.grade ?? ""}`.trim() : null,
    rarity: v.rarity,
    imageUrl: v.imageUrl,
    tcgMarket: null,
    tcgDay: null,
  };
}
