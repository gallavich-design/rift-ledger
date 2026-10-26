import type { PrismaClient } from "@prisma/client";
import { quoteVariants } from "@/lib/prices/quote";
import { toPicked } from "./picked";

export async function loadTradeLists(db: PrismaClient, userId: string, demo: boolean) {
  const items = await db.tradeListItem.findMany({ where: { userId }, include: { variant: { include: { card: true, set: true } } }, orderBy: { createdAt: "asc" } });
  const owned = await db.lot.groupBy({ by: ["variantId"], where: { userId, remainingQuantity: { gt: 0 }, variantId: { in: items.map((i) => i.variantId) } }, _sum: { remainingQuantity: true } });
  const ownedBy = new Map(owned.map((o) => [o.variantId, o._sum.remainingQuantity ?? 0]));
  const q = await quoteVariants(db, userId, demo, items.map((i) => i.variantId));
  const rows = items.map((i) => ({ id: i.id, kind: i.kind as "HAVE" | "WANT", quantity: i.quantity, note: i.note, variant: toPicked(i.variant), owned: ownedBy.get(i.variantId) ?? 0, quote: q.quotes[i.variantId] ?? null }));
  return { currency: q.currency, source: q.source, haves: rows.filter((r) => r.kind === "HAVE"), wants: rows.filter((r) => r.kind === "WANT") };
}
export type TradeRow = Awaited<ReturnType<typeof loadTradeLists>>["haves"][number];
