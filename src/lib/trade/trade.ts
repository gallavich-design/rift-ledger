// Two-sided trade calculator (spec §4.9). Unit prices come from the same price book the card pages
// use, so totals here always match the prices shown there.

export interface TradeLine {
  key: string;
  quantity: number;
  unit: number | null; // display currency
  conditionPct: number; // 100 = near mint
}

export function lineValue(l: TradeLine): number | null {
  return l.unit == null ? null : Math.round((l.unit * l.quantity * l.conditionPct) / 100);
}

export function tradeTotals(mine: TradeLine[], theirs: TradeLine[]) {
  const sum = (ls: TradeLine[]) => ls.reduce((a, l) => a + (lineValue(l) ?? 0), 0);
  const give = sum(mine);
  const get = sum(theirs);
  const unpriced = [...mine, ...theirs].filter((l) => l.unit == null).length;
  return { give, get, difference: get - give, unpriced, fair: give === get };
}
