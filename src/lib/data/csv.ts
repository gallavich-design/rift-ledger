import type { PrismaClient } from "@prisma/client";
import { ART_LABEL, type VariantArt } from "@/lib/domain/enums";
import { dayKey } from "@/config/app";

const cell = (v: unknown) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dec = (m: number) => (m / 100).toFixed(2);
const csv = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

/** Every lot you've bought (or pulled), with its landed cost — one row per lot. */
export async function lotsCsv(db: PrismaClient, userId: string) {
  const lots = await db.lot.findMany({
    where: { userId },
    include: { variant: { include: { card: true, set: true } }, order: true, storageLocation: true, packOpening: { include: { sealedProduct: true } } },
    orderBy: [{ acquiredOn: "asc" }, { createdAt: "asc" }],
  });
  return csv([
    ["acquired_on", "set", "number", "name", "printing", "finish", "language", "graded", "condition", "quantity", "remaining", "currency", "unit_price", "landed_total", "source", "storage", "notes"],
    ...lots.map((l) => [
      dayKey(l.acquiredOn),
      l.variant.set.code,
      l.variant.collectorNumber,
      l.variant.card.name,
      ART_LABEL[l.variant.art as VariantArt] ?? l.variant.art,
      l.variant.finish,
      l.variant.language,
      l.variant.gradingCompany ? `${l.variant.gradingCompany} ${l.variant.grade ?? ""}`.trim() : "",
      l.condition,
      l.quantity,
      l.remainingQuantity,
      l.currency,
      dec(l.unitPrice),
      dec(l.landedTotal),
      l.order ? `Order: ${l.order.seller}` : l.packOpening ? `Opened: ${l.packOpening.sealedProduct.name}` : "",
      l.storageLocation?.name ?? "",
      l.notes ?? "",
    ]),
  ]);
}

export async function salesCsv(db: PrismaClient, userId: string) {
  const sales = await db.sale.findMany({ where: { userId }, include: { allocations: { include: { lot: { select: { currency: true } } } } }, orderBy: { soldOn: "asc" } });
  const variants = await db.cardVariant.findMany({ where: { id: { in: [...new Set(sales.map((s) => s.variantId))] } }, include: { card: true, set: true } });
  const vBy = new Map(variants.map((v) => [v.id, v]));
  return csv([
    ["sold_on", "set", "number", "name", "finish", "quantity", "currency", "unit_price", "fees", "proceeds", "fifo_cost_basis", "cost_currency", "buyer", "notes"],
    ...sales.map((s) => {
      const v = vBy.get(s.variantId);
      return [
        dayKey(s.soldOn),
        v?.set.code,
        v?.collectorNumber,
        v?.card.name,
        v?.finish,
        s.quantity,
        s.currency,
        dec(s.unitPrice),
        dec(s.fees),
        dec(s.unitPrice * s.quantity - s.fees),
        dec(s.allocations.reduce((a, x) => a + x.costBasis, 0)),
        [...new Set(s.allocations.map((a) => a.lot.currency))].join("|"),
        s.buyer ?? "",
        s.notes ?? "",
      ];
    }),
  ]);
}
