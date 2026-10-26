// Spec §5 Example B — sales consume lots first-in-first-out. Cost is taken from each lot's exact
// landedTotal so that consuming a whole lot always uses exactly its full cost (no rounding drift).

export interface FifoLot {
  id: string;
  quantity: number; // original quantity
  remainingQuantity: number;
  landedTotal: number;
  acquiredOn: Date;
  createdAt?: Date;
}

export interface FifoAllocation {
  lotId: string;
  quantity: number;
  costBasis: number;
}

/** Cost of the first `n` units of a lot. costOfFirst(quantity) === landedTotal exactly. */
export function costOfFirst(lot: Pick<FifoLot, "quantity" | "landedTotal">, n: number): number {
  return Math.floor((lot.landedTotal * n) / lot.quantity);
}

/** Cost still attached to the units of a lot that haven't been sold. */
export function remainingCost(lot: Pick<FifoLot, "quantity" | "remainingQuantity" | "landedTotal">): number {
  return lot.landedTotal - costOfFirst(lot, lot.quantity - lot.remainingQuantity);
}

export function fifoOrder<T extends Pick<FifoLot, "acquiredOn" | "createdAt" | "id">>(lots: T[]): T[] {
  return [...lots].sort(
    (a, b) =>
      a.acquiredOn.getTime() - b.acquiredOn.getTime() ||
      (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) ||
      a.id.localeCompare(b.id),
  );
}

export class InsufficientQuantityError extends Error {}

export function consumeFifo(lots: FifoLot[], quantity: number): FifoAllocation[] {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Quantity to sell must be a positive integer");
  const available = lots.reduce((a, l) => a + l.remainingQuantity, 0);
  if (quantity > available) throw new InsufficientQuantityError(`Only ${available} available to sell`);
  const out: FifoAllocation[] = [];
  let need = quantity;
  for (const lot of fifoOrder(lots)) {
    if (!need) break;
    if (lot.remainingQuantity <= 0) continue;
    const take = Math.min(need, lot.remainingQuantity);
    const soldBefore = lot.quantity - lot.remainingQuantity;
    const cost = costOfFirst(lot, soldBefore + take) - costOfFirst(lot, soldBefore);
    out.push({ lotId: lot.id, quantity: take, costBasis: cost });
    need -= take;
  }
  return out;
}

export function realizedPL(sale: { quantity: number; unitPrice: number; fees: number }, allocations: FifoAllocation[]) {
  const proceeds = sale.quantity * sale.unitPrice - sale.fees;
  const cost = allocations.reduce((a, x) => a + x.costBasis, 0);
  return { proceeds, cost, pl: proceeds - cost };
}
