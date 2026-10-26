// Spec §5 Example A — allocate an order's extra costs (shipping, forwarding, duty, fees) to its lines
// in proportion to each line's share of the item subtotal. Integer minor units throughout; any
// rounding remainder goes to the most expensive item so the total always matches exactly.

export interface OrderLineInput {
  key: string;
  quantity: number;
  unitPrice: number; // minor units
}

export interface LandedLine {
  key: string;
  lineTotal: number;
  allocatedExtras: number;
  landedTotal: number;
  landedUnitCost: number; // floor(landedTotal / quantity) — display only
}

export function allocateLandedCost(lines: OrderLineInput[], extras: number): LandedLine[] {
  if (!lines.length) return [];
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new Error(`Line ${l.key}: quantity must be a positive integer`);
    if (!Number.isInteger(l.unitPrice) || l.unitPrice < 0) throw new Error(`Line ${l.key}: unit price must be a non-negative integer`);
  }
  if (!Number.isInteger(extras) || extras < 0) throw new Error("Extra costs must be a non-negative integer");

  const totals = lines.map((l) => l.quantity * l.unitPrice);
  const subtotal = totals.reduce((a, b) => a + b, 0);
  // Weight by value; if everything is free, weight by quantity instead.
  const weights = subtotal > 0 ? totals : lines.map((l) => l.quantity);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const shares = weights.map((w) => Math.floor((extras * w) / weightSum));
  const remainder = extras - shares.reduce((a, b) => a + b, 0);
  if (remainder) {
    // most expensive item = highest unit price; first such line on ties
    let idx = 0;
    lines.forEach((l, i) => {
      if (l.unitPrice > lines[idx].unitPrice) idx = i;
    });
    shares[idx] += remainder;
  }

  return lines.map((l, i) => {
    const landedTotal = totals[i] + shares[i];
    return {
      key: l.key,
      lineTotal: totals[i],
      allocatedExtras: shares[i],
      landedTotal,
      landedUnitCost: Math.floor(landedTotal / l.quantity),
    };
  });
}
