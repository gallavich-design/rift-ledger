// Spec §5 Example C — opening sealed product. Each pulled card's cost basis is its market value ×
// (box cost ÷ total value of all pulls). Integer minor units; the rounding remainder goes to the most
// valuable pull so the pulls' cost basis always adds up to exactly what the box cost.

export interface Pull {
  key: string;
  quantity: number;
  unitMarket: number; // minor units, same currency as the box cost; 0 when unpriced
}

export interface AllocatedPull {
  key: string;
  quantity: number;
  lineValue: number;
  costBasis: number; // for the whole line
}

export function allocatePackCost(boxCost: number, pulls: Pull[]): AllocatedPull[] {
  if (!Number.isInteger(boxCost) || boxCost < 0) throw new Error("Box cost must be a non-negative integer");
  if (!pulls.length) return [];
  for (const p of pulls) {
    if (!Number.isInteger(p.quantity) || p.quantity <= 0) throw new Error(`Pull ${p.key}: quantity must be a positive integer`);
    if (!Number.isInteger(p.unitMarket) || p.unitMarket < 0) throw new Error(`Pull ${p.key}: market value must be a non-negative integer`);
  }
  const values = pulls.map((p) => p.quantity * p.unitMarket);
  const total = values.reduce((a, b) => a + b, 0);
  // If nothing has a price yet, split the cost by number of cards instead.
  const weights = total > 0 ? values : pulls.map((p) => p.quantity);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const shares = weights.map((w) => Math.floor((boxCost * w) / weightSum));
  const remainder = boxCost - shares.reduce((a, b) => a + b, 0);
  if (remainder) {
    let idx = 0;
    weights.forEach((w, i) => {
      if (w > weights[idx]) idx = i;
    });
    shares[idx] += remainder;
  }
  return pulls.map((p, i) => ({ key: p.key, quantity: p.quantity, lineValue: values[i], costBasis: shares[i] }));
}

/** The box result shown to the user: value of pulls vs what the box cost. */
export function packResult(boxCost: number, pullsValue: number) {
  const change = pullsValue - boxCost;
  return { change, pct: boxCost ? (change / boxCost) * 100 : null };
}

/** Pull statistics for one or more openings. */
export function pullStats(pulls: { quantity: number; rarity: string | null; art: string }[]) {
  const rarity = new Map<string, number>();
  let special = 0;
  let cards = 0;
  for (const p of pulls) {
    cards += p.quantity;
    rarity.set(p.rarity ?? "Unknown", (rarity.get(p.rarity ?? "Unknown") ?? 0) + p.quantity);
    if (p.art !== "STANDARD") special += p.quantity; // alternate art, overnumbered, signature…
  }
  return { cards, special, rarity: [...rarity.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count) };
}
