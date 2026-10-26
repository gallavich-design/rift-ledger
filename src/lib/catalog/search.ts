// Typo-tolerant card search over the local cache (never hits the network per keystroke).
// Word-level scoring: each query word is matched to its closest word in the card name (or tags)
// with optimal-string-alignment distance, so "jinks", "yasou" and "mastr yi honned" all land.

import type { PrismaClient } from "@prisma/client";
import { normalizeForSearch } from "./grouping";

export interface SearchDoc {
  id: string;
  name: string;
  searchName: string;
  type: string;
  supertype: string | null;
  domains: string;
  tags: string;
  imageUrl: string | null;
  setCode: string;
}

interface IndexedDoc {
  doc: SearchDoc;
  words: string[];
  tagWords: string[];
}

export interface SearchIndex {
  docs: IndexedDoc[];
}

let index: SearchIndex | null = null;

export function invalidateSearchIndex() {
  index = null;
}

export function buildIndex(docs: SearchDoc[]): SearchIndex {
  return {
    docs: docs.map((doc) => ({
      doc,
      words: doc.searchName.split(" ").filter(Boolean),
      tagWords: normalizeForSearch(doc.tags).split(" ").filter(Boolean),
    })),
  };
}

/** Optimal string alignment distance (Levenshtein + adjacent transpositions). */
export function osaDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/** 0..1 similarity of a query token to a word, allowing the token to be an (approximate) prefix. */
function tokenScore(t: string, w: string): number {
  if (w === t) return 1;
  if (w.startsWith(t)) return t.length >= 2 ? 0.95 : 0.7;
  const full = 1 - osaDistance(t, w) / Math.max(t.length, w.length);
  // approximate prefix: compare against the word's first |t| (±1) letters
  let prefix = 0;
  if (t.length >= 3 && w.length > t.length) {
    for (const len of [t.length - 1, t.length, t.length + 1]) {
      const head = w.slice(0, len);
      prefix = Math.max(prefix, (1 - osaDistance(t, head) / Math.max(t.length, head.length)) * 0.9);
    }
  }
  return Math.max(full, prefix);
}

function scoreDoc(tokens: string[], d: IndexedDoc, q: string): number {
  if (d.doc.searchName === q) return 10;
  let total = 0;
  for (const t of tokens) {
    let best = 0;
    for (const w of d.words) best = Math.max(best, tokenScore(t, w));
    for (const w of d.tagWords) best = Math.max(best, tokenScore(t, w) * 0.85);
    // a token too far from every word sinks the whole doc
    if (best < 0.5) return 0;
    total += best;
  }
  return total / tokens.length;
}

const MIN_SCORE = 0.58;

/** Ranked matches with a 0–1 confidence (10 = exact name). */
export function rankSearchScored(idx: SearchIndex, query: string, limit = 20): { doc: SearchDoc; score: number }[] {
  const q = normalizeForSearch(query);
  if (!q) return [];
  const tokens = q.split(" ");
  return idx.docs
    .map((d) => ({ d, s: scoreDoc(tokens, d, q) }))
    .filter((x) => x.s >= MIN_SCORE)
    .sort((a, b) => b.s - a.s || a.d.doc.name.length - b.d.doc.name.length || a.d.doc.name.localeCompare(b.d.doc.name))
    .slice(0, limit)
    .map((x) => ({ doc: x.d.doc, score: x.s }));
}

export function rankSearch(idx: SearchIndex, query: string, limit = 20): SearchDoc[] {
  return rankSearchScored(idx, query, limit).map((x) => x.doc);
}

export async function getSearchIndex(db: PrismaClient) {
  if (index) return index;
  const cards = await db.card.findMany({
    select: {
      id: true,
      name: true,
      searchName: true,
      type: true,
      supertype: true,
      domains: true,
      tags: true,
      imageUrl: true,
      set: { select: { code: true } },
    },
  });
  index = buildIndex(cards.map(({ set, ...c }) => ({ ...c, setCode: set.code }))); // tags stay pipe-delimited ("|Master Yi|")
  return index;
}

export async function searchCards(db: PrismaClient, query: string, limit = 20) {
  return rankSearch(await getSearchIndex(db), query, limit);
}
