export interface MatchLike {
  opponentLegend: string;
  result: string; // WIN | LOSS | DRAW
}

export interface Record3 {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number | null; // wins / games × 100 (draws count as games)
}

function tally(ms: MatchLike[]): Record3 {
  const wins = ms.filter((m) => m.result === "WIN").length;
  const losses = ms.filter((m) => m.result === "LOSS").length;
  const draws = ms.filter((m) => m.result === "DRAW").length;
  return { games: ms.length, wins, losses, draws, winRate: ms.length ? (wins / ms.length) * 100 : null };
}

export function winRates(matches: MatchLike[]) {
  const groups = new Map<string, MatchLike[]>();
  for (const m of matches) groups.set(m.opponentLegend, [...(groups.get(m.opponentLegend) ?? []), m]);
  return {
    overall: tally(matches),
    byOpponent: [...groups.entries()]
      .map(([opponentLegend, ms]) => ({ opponentLegend, ...tally(ms) }))
      .sort((a, b) => b.games - a.games || a.opponentLegend.localeCompare(b.opponentLegend)),
  };
}
